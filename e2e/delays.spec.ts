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
  let bus: Trip | undefined
  await expect.poll(async () => (bus = await delayedBus()), { timeout: 90_000 }).toBeDefined()
  if (!bus) throw new Error('No bus 2 min off its timetable')
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

/** Where the canvas draws the spotlight's ring, in px from the page's top left, while it does. */
async function ringAt(page: Page) {
  const at = await page.locator('[data-vehicles]').getAttribute('data-spotlight-at')
  if (!at) return undefined
  const [x, y] = at.split(' ').map(Number)
  return { x, y }
}

/** The ring's outer radius, size.target-min's 24 px across. */
const RING = 12

/**
 * Expects the ring, once the camera has landed, clear of the header, the pill's row included, and
 * of the open `panel`: beside it on a desktop, clear of the Overview sheet too, above its peek and
 * the map's foot on a phone.
 */
async function expectRingClear(page: Page, panel: Locator) {
  const { width, height } = page.viewportSize()!
  const header = await boxOf(page.getByRole('banner'))
  // Mid-flight the ring sweeps across the screen: it counts once the camera is at rest, its
  // place in the address unchanged for longer than the dot takes to reach a new snapshot's place
  // and a second ease to begin.
  const kept = () => new URL(page.url()).searchParams.get('map')
  await expect(async () => {
    const rested = kept()
    expect(rested).not.toBeNull()
    await page.waitForTimeout(1_500)
    expect(kept()).toBe(rested)
    const at = await ringAt(page)
    expect(at).toBeDefined()
    const open = await boxOf(panel)
    expect(at!.y - RING).toBeGreaterThan(header.y + header.height)
    expect(at!.x - RING).toBeGreaterThan(0)
    if (width > 760) {
      const sheet = await boxOf(page.getByRole('dialog', { name: 'Overview' }))
      expect(at!.x - RING).toBeGreaterThan(sheet.x + sheet.width)
      expect(at!.x + RING).toBeLessThan(open.x)
      expect(at!.y + RING).toBeLessThan(height)
    } else {
      expect(at!.x + RING).toBeLessThan(width)
      // Above the map's foot too, which stands on the peek: the legend, the controls.
      const legend = await boxOf(page.getByRole('list', { name: 'Data states' }))
      expect(at!.y + RING).toBeLessThan(legend.y)
      expect(at!.y + RING).toBeLessThan(open.y)
    }
  }).toPass({ timeout: 15_000 })
}

for (const [layout, viewport] of [
  ['a desktop', { width: 1280, height: 800 }],
  ['a 412 px phone', { width: 412, height: 915 }],
] as const) {
  test(`on ${layout}, a press on the pill flies to the latest trip and rings its dot, until its panel closes`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    // At 09:22 the 950R to Hillerød runs 77 min late, far out of the opening view.
    await onSavedMinute(page)
    await page.goto(`${UPDATES_URL}/en`)
    const map = page.locator('[data-vehicles]')
    await expect(map).not.toHaveAttribute('data-spotlight')
    await page
      .getByRole('banner')
      .getByRole('button', { name: /^Biggest delay right now: 950R to Hillerød/ })
      .click()
    await expect(page).toHaveURL(/[?&]trip=train\.950R\.bacca19217\.20261031\.0733(&|$)/)
    const panel = page.getByRole('dialog', { name: /to Hillerød/ })
    await expect(panel).toBeVisible()
    // The ring is on the named trip's dot, and on no other.
    await expect(map).toHaveAttribute('data-spotlight', 'train.950R.bacca19217.20261031.0733')
    await expectRingClear(page, panel)
    // The dot under the ring is the 950R's: its card names it.
    await expect(async () => {
      const at = (await ringAt(page))!
      await page.mouse.move(at.x + 30, at.y + 30)
      await page.mouse.move(at.x, at.y)
      await expect(page.getByRole('tooltip')).toContainText('950R to Hillerød', { timeout: 1000 })
    }).toPass()
    // Closing the panel takes the ring off.
    await panel.getByRole('button', { name: 'Close' }).click()
    await expect(panel).toBeHidden()
    await expect(map).not.toHaveAttribute('data-spotlight')
    await expect(map).not.toHaveAttribute('data-spotlight-at')
  })
}

test('a snapshot that moves the trip while the camera flies to it still lands its ring clear of the header and the panel', async ({
  page,
}) => {
  // The saved minute of 09:22, due again 4 s on; the next answer, held until the camera is in the
  // air, has the 950R 3 km back along its way, far enough that its dot jumps.
  const minute = savedUpdatesSnapshot('0002.json') as SnapshotLike & { readonly nextDue: number }
  const LATEST = 'train.950R.bacca19217.20261031.0733'
  const moved = {
    ...minute,
    fetched: minute.fetched + 4_000,
    nextDue: minute.fetched + 600_000,
    trips: minute.trips.map((trip) =>
      trip.key === LATEST
        ? { ...trip, progress: (trip as Trip & { progress: number }).progress - 3_000 }
        : trip,
    ),
  }
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.clock.install({ time: minute.fetched })
  let asked = 0
  let heldAsked = () => {}
  const held = new Promise<void>((resolve) => (heldAsked = resolve))
  let release = () => {}
  const released = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/api/snapshot', async (route) => {
    const first = asked++ === 0
    const answer = first ? { ...minute, nextDue: minute.fetched + 4_000 } : moved
    if (!first) {
      heldAsked()
      await released
    }
    await route.fulfill({
      json: answer,
      headers: { date: new Date(answer.fetched).toUTCString(), 'cache-control': 'no-store' },
    })
  })
  await page.goto(`${UPDATES_URL}/en`)
  const pill = page
    .getByRole('banner')
    .getByRole('button', { name: /^Biggest delay right now: 950R to Hillerød/ })
  await expect(pill).toBeVisible()
  await held
  await pill.click()
  // The next minute lands while the camera is in the air.
  await page.waitForTimeout(300)
  release()
  const panel = page.getByRole('dialog', { name: /to Hillerød/ })
  await expect(panel).toBeVisible()
  await expect(page.locator('[data-vehicles]')).toHaveAttribute('data-spotlight', LATEST)
  await expect.poll(() => asked).toBe(2)
  await expectRingClear(page, panel)
})

/**
 * How many characters of the pill's stop name show before the ellipsis: those whose glyphs end
 * inside the stop's visible box, short of the ellipsis's room; all of them when none is cut.
 */
const visibleStopCharacters = (pill: Locator) =>
  pill.locator('[data-latest-where]').evaluate((where) => {
    const stop = where.querySelector('[data-latest-stop]')!.firstChild!
    const length = stop.textContent!.length
    if (where.scrollWidth <= where.clientWidth) return length
    const range = document.createRange()
    const right = where.getBoundingClientRect().left + where.clientWidth
    // The ellipsis takes about a character's room at the end.
    range.setStart(stop, 0)
    range.setEnd(stop, 1)
    const ellipsis = range.getBoundingClientRect().width
    let shown = 0
    for (let end = 1; end <= length; end++) {
      range.setEnd(stop, end)
      if (range.getBoundingClientRect().right > right - ellipsis) break
      shown = end
    }
    return shown
  })

/**
 * Expects the pill's words whole inside it: its first words, the line badge and the delay, and at
 * least the start of the stop's name, `kept` characters, before any ellipsis.
 */
async function expectPillWhole(pill: Locator, now: string, line: string, kept: number) {
  const box = await boxOf(pill)
  expect(await pill.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  for (const part of [
    pill.getByText(now, { exact: true }),
    pill.getByText(line, { exact: true }),
    pill.locator('.pn-Delay'),
  ]) {
    const inside = await boxOf(part)
    expect(inside.x).toBeGreaterThanOrEqual(box.x)
    expect(inside.x + inside.width).toBeLessThanOrEqual(box.x + box.width)
  }
  expect(await visibleStopCharacters(pill)).toBeGreaterThanOrEqual(kept)
}

const PHONE = {
  en: {
    now: 'Latest now',
    name: 'Biggest delay right now: 250S to Dragør Stationsplads, 100 min late, ',
    at: 'at',
  },
  da: {
    now: 'Mest forsinket nu',
    name: 'Største forsinkelse lige nu: 250S mod Dragør Stationsplads, 100 min forsinket, ',
    at: 'ved',
  },
} as const

for (const lang of ['en', 'da'] as const) {
  for (const width of [412, 360]) {
    test(`on a ${width} px phone in ${lang} the pill takes a row of its own and fits it, ten characters of the stop in view`, async ({
      page,
    }) => {
      const words = PHONE[lang]
      await page.setViewportSize({ width, height: 800 })
      await onSavedMinute(page, longStopLatest)
      await page.goto(`${UPDATES_URL}/${lang}`)
      const pill = page.getByRole('banner').getByRole('button', {
        name: new RegExp(`^${words.name}`),
      })
      await expect(pill).toBeVisible()
      // Under the bar's first row, inside the screen, and inside its row's glass.
      const about = await boxOf(page.getByRole('button', { name: WORDS[lang].about }))
      const box = await boxOf(pill)
      expect(box.y).toBeGreaterThanOrEqual(about.y + about.height)
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(width)
      const row = await boxOf(pill.locator('xpath=..'))
      expect(box.y).toBeGreaterThanOrEqual(row.y)
      expect(box.y + box.height).toBeLessThanOrEqual(row.y + row.height)
      // "Latest now", the badge, the delay, and at least ten characters of the stop's name: on
      // the pill's line where they fit, else on a second line of its own.
      await expectPillWhole(pill, words.now, '250S', 10)
      // The stop's long name is cut by an ellipsis past what its line holds.
      const where = pill.locator('[data-latest-where]')
      await expect(where).toHaveText(new RegExp(`^${words.at} Hillerødmotorvejen, Tingbjerg`))
      expect(await where.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
        true,
      )
      expect(await where.evaluate((element) => getComputedStyle(element).textOverflow)).toBe(
        'ellipsis',
      )
      // The Overview sheet starts below the header, the pill's taller row included.
      await expectBelowHeader(
        page,
        page.getByRole('dialog', { name: WORDS[lang].overview }).getByRole('heading', {
          name: WORDS[lang].overview,
        }),
      )
    })
  }
}

/** Whether the stop's words sit on a line of their own under "Latest now" in the pill. */
const whereWrapped = async (pill: Locator, now: string) =>
  (await boxOf(pill.locator('[data-latest-where]'))).y >=
  (await boxOf(pill.getByText(now, { exact: true }))).y +
    (await boxOf(pill.getByText(now, { exact: true }))).height

test('on a 412 px phone in English the pill keeps its stop on its one line', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 800 })
  await onSavedMinute(page, longStopLatest)
  await page.goto(`${UPDATES_URL}/en`)
  const pill = page
    .getByRole('banner')
    .getByRole('button', { name: new RegExp(`^${PHONE.en.name}`) })
  await expect(pill).toBeVisible()
  expect(await whereWrapped(pill, PHONE.en.now)).toBe(false)
  expect(await visibleStopCharacters(pill)).toBeGreaterThanOrEqual(10)
})

test('on a 360 px phone in Danish the pill puts its stop on a second line', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await onSavedMinute(page, longStopLatest)
  await page.goto(`${UPDATES_URL}/da`)
  const pill = page
    .getByRole('banner')
    .getByRole('button', { name: new RegExp(`^${PHONE.da.name}`) })
  await expect(pill).toBeVisible()
  expect(await whereWrapped(pill, PHONE.da.now)).toBe(true)
})

const WORDS = {
  en: {
    filters: 'Filters',
    about: 'About Mylder',
    overview: 'Overview',
    now: 'Latest now',
    pill: /^Biggest delay right now: 250S to Dragør Stationsplads, 100 min late, /,
    outOfDate: /^Updated \d\d:\d\d:\d\d, may be out of date$/,
    quiet: 'Delays from Rejseplanen not updated since 09:21',
  },
  da: {
    filters: 'Filtre',
    about: 'Om Mylder',
    overview: 'Overblik',
    now: 'Mest forsinket nu',
    pill: /^Største forsinkelse lige nu: 250S mod Dragør Stationsplads, 100 min forsinket, /,
    outOfDate: /^Opdateret \d\d:\d\d:\d\d, /,
    quiet: 'Forsinkelser fra Rejseplanen ikke opdateret siden 09:21',
  },
} as const

/**
 * Expects the top bar on one row, as without the pill, and clear of the Overview sheet's heading:
 * the About button level with the brand, the bar no taller than one row of 58 px, the heading
 * under it; and the pill, in the bar or on its row under it, clear of the heading too.
 */
async function expectOneRow(page: Page, words: (typeof WORDS)[keyof typeof WORDS], pill: Locator) {
  const bar = await boxOf(page.locator('.pn-TopBar'))
  const brand = await boxOf(page.getByRole('link', { name: 'Mylder' }))
  const about = await boxOf(page.getByRole('button', { name: words.about }))
  expect(Math.abs(about.y + about.height / 2 - (brand.y + brand.height / 2))).toBeLessThan(4)
  expect(bar.height).toBeLessThanOrEqual(58)
  const heading = await boxOf(
    page
      .getByRole('dialog', { name: words.overview })
      .getByRole('heading', { name: words.overview }),
  )
  expect(heading.y).toBeGreaterThanOrEqual(bar.y + bar.height)
  const box = await boxOf(pill)
  const apart =
    box.x >= heading.x + heading.width ||
    box.x + box.width <= heading.x ||
    box.y >= heading.y + heading.height ||
    box.y + box.height <= heading.y
  expect(apart).toBe(true)
}

/** Whether the pill sits in the top bar, rather than on its row under it. */
const inBar = (pill: Locator) => pill.evaluate((element) => element.closest('.pn-TopBar') !== null)

/** Expects `heading` to start at or below the bottom of the page's header, the pill's row too. */
async function expectBelowHeader(page: Page, heading: Locator) {
  await expect(heading).toBeVisible()
  const header = await boxOf(page.getByRole('banner'))
  expect((await boxOf(heading)).y).toBeGreaterThanOrEqual(header.y + header.height)
}

/** The page `width` px wide in `lang` with six chips: the modes and, from the weekday's, the planes. */
async function openWide(page: Page, lang: keyof typeof WORDS, width = 1280) {
  await page.setViewportSize({ width, height: 800 })
  await serveAircraft(page, 0)
  await page.goto(`${UPDATES_URL}/${lang}`)
  // Bus, Metro, S-tog, Train, Light rail and Planes.
  await expect(
    page.getByRole('group', { name: WORDS[lang].filters }).getByRole('button'),
  ).toHaveCount(6)
}

for (const lang of ['en', 'da'] as const) {
  const words = WORDS[lang]

  for (const width of [800, 900, 1000, 1100, 1280, 1440, 1920]) {
    test(`at ${width} px with six chips in ${lang}, the pill fits where it sits and covers no heading`, async ({
      page,
    }) => {
      await onSavedMinute(page, longStopLatest)
      await openWide(page, lang, width)
      const pill = page.getByRole('banner').getByRole('button', { name: words.pill })
      await expect(pill).toBeVisible()
      // In the bar, or on its row where the bar has no room: ten characters of the stop's name.
      await expectPillWhole(pill, words.now, '250S', 10)
      // Wherever the bar holds the pill, it holds it on one row.
      if (await inBar(pill)) await expectOneRow(page, words, pill)
      // The Overview sheet and the trip's panel start below the header, the pill's row included.
      await expectBelowHeader(
        page,
        page.getByRole('dialog', { name: words.overview }).getByRole('heading', {
          name: words.overview,
        }),
      )
      await pill.click()
      await expectBelowHeader(
        page,
        page.getByRole('dialog', { name: /Dragør Stationsplads/ }).getByRole('heading', {
          name: /Dragør Stationsplads/,
        }),
      )
    })
  }

  test(`at 900 px in ${lang}, the pill takes its row at the start under the bar`, async ({
    page,
  }) => {
    // The bar wraps onto two rows at 900 px without the pill, so the pill has its own row.
    await onSavedMinute(page, longStopLatest)
    await openWide(page, lang, 900)
    const pill = page.getByRole('banner').getByRole('button', { name: words.pill })
    await expect(pill).toBeVisible()
    expect(await inBar(pill)).toBe(false)
    const bar = await boxOf(page.locator('.pn-TopBar'))
    const box = await boxOf(pill)
    expect(box.y).toBeGreaterThanOrEqual(bar.y + bar.height)
    // At the start, its glass level with the bar's, as wide as its words: all of them show.
    const row = await boxOf(pill.locator('xpath=..'))
    expect(Math.abs(row.x - bar.x)).toBeLessThan(1)
    expect(await visibleStopCharacters(pill)).toBe(
      'Hillerødmotorvejen, Tingbjerg (Hillerødmotorvejen)'.length,
    )
  })

  test(`in ${lang}, the pill leaves the bar as the window narrows and comes back as it widens`, async ({
    page,
  }) => {
    await onSavedMinute(page, longStopLatest)
    await openWide(page, lang, 1440)
    const pill = page.getByRole('banner').getByRole('button', { name: words.pill })
    await expect(pill).toBeVisible()
    await expect.poll(() => inBar(pill)).toBe(true)
    await page.setViewportSize({ width: 1000, height: 800 })
    await expect.poll(() => inBar(pill)).toBe(false)
    await expectPillWhole(pill, words.now, '250S', 10)
    await page.setViewportSize({ width: 1440, height: 800 })
    await expect.poll(() => inBar(pill)).toBe(true)
    await expectOneRow(page, words, pill)
    await expectPillWhole(pill, words.now, '250S', 10)
  })

  test(`at 1440 px in ${lang}, the pill sits in the bar with its stop cut short`, async ({
    page,
  }) => {
    // The chips leave the bar room for the pill less the end of its stop's long name.
    await onSavedMinute(page, longStopLatest)
    await openWide(page, lang, 1440)
    const pill = page.getByRole('banner').getByRole('button', { name: words.pill })
    await expect(pill).toBeVisible()
    expect(await inBar(pill)).toBe(true)
    const where = pill.locator('[data-latest-where]')
    expect(await where.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
    await expectOneRow(page, words, pill)
    await expectPillWhole(pill, words.now, '250S', 10)
  })

  test(`at 1280 px with six chips in ${lang} and a long Updated line, the pill still fits`, async ({
    page,
  }) => {
    // 90 s past the minute, its snapshot may be out of date, and the Updated line says so.
    await onSavedMinute(page, longStopLatest, 90_000)
    await openWide(page, lang)
    await expect(page.getByRole('banner').getByText(words.outOfDate)).toBeVisible()
    const pill = page.getByRole('banner').getByRole('button', { name: words.pill })
    await expect(pill).toBeVisible()
    await expectOneRow(page, words, pill)
    // In the bar, or on its row where the bar has no room: ten characters of the stop's name.
    await expectPillWhole(pill, words.now, '250S', 10)
  })

  test(`at 1280 px with six chips in ${lang}, the quiet pill keeps the bar on one row`, async ({
    page,
  }) => {
    // A snapshot of 09:28, six minutes past the delays' last message, at 09:21:52: the feed is
    // quiet, while the positions are as fresh as the server's runs keep them.
    const later = 6 * 60_000
    await onSavedMinute(page, (saved) => ({ ...saved, fetched: saved.fetched + later }), later)
    await openWide(page, lang)
    const quiet = page.getByRole('banner').getByText(words.quiet)
    await expect(quiet).toBeVisible()
    expect(await quiet.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    await expectOneRow(page, words, quiet)
  })
}
