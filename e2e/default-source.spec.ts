import { expect, test } from '@playwright/test'
import { DEFAULT_URL } from './recording'

// The default source: a server with MYLDER_SOURCE unset, as `npm run dev` with nothing set or a
// deployment that forgets the variable, runs on the deployed timetable at the real time, so the
// page keeps the real clock here, not the recording's.

interface SnapshotLike {
  readonly source: unknown
  readonly positionMode: string
  readonly status: { readonly calls: readonly unknown[] }
  readonly trips: readonly { readonly state: string }[]
}

test('with MYLDER_SOURCE unset, the map runs on the timetable', async ({ page, request }) => {
  const response = await request.get(`${DEFAULT_URL}/api/snapshot`)
  expect(response.status()).toBe(200)
  const snapshot = (await response.json()) as SnapshotLike
  expect(snapshot.source).toEqual({ kind: 'timetable' })
  expect(snapshot.positionMode).toBe('none')
  expect(snapshot.status.calls).toEqual([])
  expect(snapshot.trips.length).toBeGreaterThan(0)
  expect(new Set(snapshot.trips.map((trip) => trip.state))).toEqual(new Set(['timetable-only']))

  await page.goto(`${DEFAULT_URL}/en`)
  // Neither a banner nor the legend names the source; About does.
  await expect(page.getByRole('list', { name: 'Data states' })).toBeVisible()
  await expect(page.getByText("live positions aren't connected yet")).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: /^Timetable only:/ })).toHaveCount(0)
  const map = page.locator('[data-vehicles]')
  await expect
    .poll(async () => Number(await map.getAttribute('data-vehicles')), {
      message: 'vehicles drawn',
    })
    .toBeGreaterThan(0)
})
