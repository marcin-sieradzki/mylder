import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { savedUpdatesSnapshot, serveAircraft, UPDATES_URL } from './recording'

// SIRI-ET's delays on the map (spec #146): a server on the timetable source with updates from the
// SIRI-ET recording, which runs the reader inside the tracker over its messages from 09:00 on
// Saturday 31 October 2026, on its own timetable. The server's clock runs on from its first
// request, so the page reads it from the server's answers, as it always does.

interface Trip {
  readonly key: string
  readonly mode: string
  readonly headsign: string
  readonly next: readonly { readonly stop: string }[]
  readonly state: string
  readonly position: [number, number]
  readonly delay?: number
  readonly steps?: readonly (readonly [index: number, delay: number])[]
  readonly updated?: number
  readonly cancelled?: true
}

interface SnapshotLike {
  readonly fetched: number
  readonly source: unknown
  readonly updates: { readonly kind: string; readonly fresh: boolean }
  readonly trips: readonly Trip[]
}

const snapshotNow = async (request: APIRequestContext) =>
  (await (await request.get(`${UPDATES_URL}/api/snapshot`)).json()) as SnapshotLike

test('with updates from the SIRI-ET recording, the server draws trips Estimated on their delay', async ({
  request,
}) => {
  const snapshot = await snapshotNow(request)
  expect(snapshot.source).toEqual({ kind: 'timetable' })
  expect(snapshot.updates).toMatchObject({ kind: 'recording', fresh: true })
  const estimated = snapshot.trips.filter((trip) => trip.state === 'estimated')
  expect(estimated.length).toBeGreaterThan(0)
  for (const trip of estimated) expect(trip.updated).toBeDefined()
  // SIRI-ET has no Metro: every Metro trip stays Timetable only.
  const metro = snapshot.trips.filter((trip) => trip.mode === 'metro')
  expect(metro.length).toBeGreaterThan(0)
  for (const trip of metro) expect(trip.state).toBe('timetable-only')
  expect(snapshot.trips.some((trip) => ['live', 'ageing'].includes(trip.state))).toBe(false)
})

test('the page draws the Estimated dots', async ({ page, request }) => {
  await page.goto(`${UPDATES_URL}/en`)
  await expect(page.getByRole('list', { name: 'Data states' })).toBeVisible()
  // Neither a banner nor the legend names the source.
  await expect(page.getByText("live positions aren't connected yet")).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: /^Timetable and delays:/ })).toHaveCount(
    0,
  )
  // Every trip of the snapshot is drawn but the cancelled ones; the next minute's may land.
  const map = page.locator('[data-vehicles]')
  await expect(async () => {
    const drawn = Number(await map.getAttribute('data-vehicles'))
    const { trips } = await snapshotNow(request)
    expect(drawn).toBe(trips.filter((trip) => !trip.cancelled).length)
  }).toPass()
})

test('a delayed bus’s card says Estimated', async ({ page }) => {
  // The saved minute of 09:22, served at its moment, so every dot is where it put them.
  const saved = savedUpdatesSnapshot('0002.json') as SnapshotLike
  await page.clock.install({ time: saved.fetched })
  await page.route('**/api/snapshot', (route) =>
    route.fulfill({
      json: saved,
      headers: { date: new Date(saved.fetched).toUTCString(), 'cache-control': 'no-store' },
    }),
  )
  const bus = saved.trips.find(
    (trip) => trip.mode === 'bus' && trip.state === 'estimated' && (trip.delay ?? 0) >= 120,
  )!
  const [lat, lon] = bus.position
  await page.goto(`${UPDATES_URL}/en?map=16.00/${lat.toFixed(5)}/${lon.toFixed(5)}`)
  await page.getByRole('button', { name: 'Pause' }).click()
  const { width, height } = page.viewportSize()!
  const card = page.getByRole('tooltip')
  await expect(async () => {
    await page.mouse.move(width / 2 + 40, height / 2 + 40)
    await page.mouse.move(width / 2, height / 2)
    await expect(card).toContainText('Estimated', { timeout: 1000 })
  }).toPass()
})

test('an opened delayed bus and its next stop show its expected times and the delays’ update', async ({
  page,
  request,
}) => {
  // A bus whose update has some call 2 min or more off its timetable. Its `delay` is the one at its
  // next call, which in the recording's first minute is under 2 min for every bus with an update.
  // The server's clock starts at its first request, and its table fills as the messages come, so
  // a test that asks first waits for one, up to the next minute's run.
  test.setTimeout(150_000)
  const delayedBus = async () =>
    (await snapshotNow(request)).trips.find(
      (trip) =>
        trip.mode === 'bus' &&
        trip.state === 'estimated' &&
        !trip.cancelled &&
        (trip.steps ?? []).some(([, delay]) => Math.abs(delay) >= 120) &&
        trip.next.length > 0,
    )
  await expect.poll(delayedBus, { timeout: 90_000 }).toBeDefined()
  const bus = (await delayedBus())!
  const source = /Timetable and Rejseplanen's delays\s·\supdated\s\d\d:\d\d:\d\d/
  await page.goto(`${UPDATES_URL}/en?trip=${encodeURIComponent(bus.key)}`)
  const vehicle = page.getByRole('dialog', { name: `to ${bus.headsign}` })
  await expect(vehicle).toContainText(source)
  await expect(vehicle.getByRole('list', { name: 'Stops' })).toContainText(/~\d\d:\d\d/)
  await page.goto(`${UPDATES_URL}/en?stop=${bus.next[0].stop}`)
  const stop = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('tab', { name: 'Departures' }) })
  await expect(stop.getByRole('list', { name: 'Departures' })).toContainText(/~\d\d:\d\d/)
  await expect(stop).toContainText(source)
  await expect(stop).toContainText(
    "Countdowns use the timetable, moved by Rejseplanen's delay where a trip has one; the rest use the timetable alone.",
  )
})

/**
 * Serves the saved minute of 09:22, changed by `change`, with the server's clock `after` ms past
 * it, so the pill names its trips.
 */
async function onSavedMinute(
  page: Page,
  change: (saved: SnapshotLike) => SnapshotLike = (saved) => saved,
  after = 0,
) {
  const minute = savedUpdatesSnapshot('0002.json') as SnapshotLike
  const saved = change(minute)
  const now = minute.fetched + after
  await page.clock.install({ time: now })
  await page.route('**/api/snapshot', (route) =>
    route.fulfill({
      json: saved,
      headers: { date: new Date(now).toUTCString(), 'cache-control': 'no-store' },
    }),
  )
}

/**
 * The bus 250S at 09:04, its last stop passed Hillerødmotorvejen, Tingbjerg (Hillerødmotorvejen),
 * made the latest, 100 min late: the longest stop name a pill can name in the saved minute.
 */
const LONG_STOP = 'bus.250S.0c7bd8e0e7.20261031.0904'
const longStopLatest = (saved: SnapshotLike): SnapshotLike => ({
  ...saved,
  trips: saved.trips.map((trip) => (trip.key === LONG_STOP ? { ...trip, delay: 6000 } : trip)),
})

/** The box of `locator`, which must be on the page. */
const boxOf = async (locator: Locator) => (await locator.boundingBox())!

test('the Latest now pill names the trip running latest and opens its panel', async ({ page }) => {
  // At 09:22 the 950R to Hillerød runs 77 min late, between Slotspavillonen St. and Hillerød St.
  await onSavedMinute(page)
  await page.goto(`${UPDATES_URL}/en`)
  const pill = page.getByRole('banner').getByRole('button', {
    name: 'Biggest delay right now: 950R to Hillerød, 77 min late, between Slotspavillonen St. and Hillerød St.',
  })
  await expect(pill).toContainText('Latest now')
  await expect(pill).toContainText('at Slotspavillonen St.')
  await pill.click()
  await expect(page).toHaveURL(/[?&]trip=train\.950R\.bacca19217\.20261031\.0733(&|$)/)
  await expect(page.getByRole('dialog', { name: /to Hillerød/ })).toContainText('950R')
})

for (const width of [412, 360]) {
  test(`on a ${width} px phone the pill takes a row of its own and fits it, the stop cut short`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 })
    await onSavedMinute(page, longStopLatest)
    await page.goto(`${UPDATES_URL}/en`)
    const pill = page.getByRole('banner').getByRole('button', {
      name: /^Biggest delay right now: 250S to Dragør Stationsplads, 100 min late, /,
    })
    await expect(pill).toBeVisible()
    // Under the bar's first row, and inside the screen.
    const about = await boxOf(page.getByRole('button', { name: 'About Mylder' }))
    const box = await boxOf(pill)
    expect(box.y).toBeGreaterThanOrEqual(about.y + about.height)
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(width)
    // Its words never spill out of it.
    expect(await pill.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    // "Latest now", the badge and the delay whole inside it; the stop's name cut by an ellipsis.
    for (const part of [
      pill.getByText('Latest now'),
      pill.getByText('250S'),
      pill.locator('.pn-Delay'),
    ]) {
      const inside = await boxOf(part)
      expect(inside.x).toBeGreaterThanOrEqual(box.x)
      expect(inside.x + inside.width).toBeLessThanOrEqual(box.x + box.width)
    }
    const stop = pill.getByText(/^at Hillerødmotorvejen, Tingbjerg/)
    expect(await stop.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
    expect(await stop.evaluate((element) => getComputedStyle(element).textOverflow)).toBe(
      'ellipsis',
    )
    const inside = await boxOf(stop)
    expect(inside.x + inside.width).toBeLessThanOrEqual(box.x + box.width)
  })
}

/**
 * Expects the top bar on one row, as without the pill, and the Overview sheet's heading clear of
 * it: the tools on the brand's row, the bar no taller than its one row of 58 px.
 */
async function expectOneRow(page: Page) {
  const bar = page.locator('.pn-TopBar')
  const brand = await boxOf(page.getByRole('link', { name: 'Mylder' }))
  const about = await boxOf(page.getByRole('button', { name: 'About Mylder' }))
  expect(Math.abs(about.y + about.height / 2 - (brand.y + brand.height / 2))).toBeLessThan(4)
  const { y, height } = await boxOf(bar)
  expect(height).toBeLessThanOrEqual(58)
  const sheet = await boxOf(
    page.getByRole('dialog', { name: 'Overview' }).getByRole('heading', { name: 'Overview' }),
  )
  expect(sheet.y).toBeGreaterThanOrEqual(y + height)
}

test('at 1280 px with six chips the pill keeps the top bar on one row', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await serveAircraft(page, 0)
  await onSavedMinute(page, longStopLatest)
  await page.goto(`${UPDATES_URL}/en`)
  // Bus, Metro, S-tog, Train, Light rail and Planes.
  await expect(page.getByRole('group', { name: 'Filters' }).getByRole('button')).toHaveCount(6)
  const pill = page.getByRole('banner').getByRole('button', { name: /^Biggest delay right now:/ })
  await expect(pill).toBeVisible()
  await expectOneRow(page)
  // In the bar's tools, beside the About button.
  const about = await boxOf(page.getByRole('button', { name: 'About Mylder' }))
  const box = await boxOf(pill)
  expect(Math.abs(box.y + box.height / 2 - (about.y + about.height / 2))).toBeLessThan(4)
  expect(await pill.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
})

test('at 1280 px with six chips the quiet pill keeps the top bar on one row', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await serveAircraft(page, 0)
  // A snapshot of 09:28, six minutes past the delays' last message, at 09:21:52: the feed is
  // quiet, while the positions are as fresh as the server's runs keep them.
  const later = 6 * 60_000
  await onSavedMinute(page, (saved) => ({ ...saved, fetched: saved.fetched + later }), later)
  await page.goto(`${UPDATES_URL}/en`)
  await expect(page.getByRole('group', { name: 'Filters' }).getByRole('button')).toHaveCount(6)
  await expect(
    page.getByRole('banner').getByText('Delays from Rejseplanen not updated since 09:21'),
  ).toBeVisible()
  await expectOneRow(page)
})
