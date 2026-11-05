import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { esc, mapEl, box, mapParam } from './lib.ts'
import { W, type Lang, snapshot, waitStandout, dims, startSampler, ringClear } from './p.ts'

/** Press a Next latest row just as the page requests /api/snapshot: once the camera rests, the ring is clear. */
export async function raceRow({ page, step, expect }: Journey, o: { width?: number; lang: Lang; phone?: boolean; row?: number }) {
  const w = W[o.lang]
  const phone = !!o.phone
  await dims(page, o.width)
  await page.goto('/' + o.lang)
  const pill = await waitStandout(page, expect, o.lang)
  const map0 = mapParam(page)
  await startSampler(page)
  await pill.click()
  const panel = page.getByRole('dialog', { name: w.title })
  await expect(panel).toBeVisible()
  await ringClear(page, expect, panel, o.lang, phone, 'pill', map0)
  const rows = panel.getByRole('region', { name: w.next }).getByRole('button')
  await expect(rows).toHaveCount(4)
  if (phone) await rows.nth(o.row ?? 0).scrollIntoViewIfNeeded()
  await step('panel open, waiting for the minute')
  const req = page.waitForRequest('**/api/snapshot', { timeout: 75000 })
  await req
  const name = (await rows.nth(o.row ?? 0).getAttribute('aria-label')) ?? ''
  const map1 = mapParam(page)
  await startSampler(page)
  await rows.nth(o.row ?? 0).click({ timeout: 3000 })
  console.log('tapped', name, 'as the snapshot request went out')
  await step('row tapped as the snapshot is requested')
  const key = new URL(page.url()).searchParams.get('trip')!
  const t = (await snapshot(page)).trips.find((x: any) => x.key === key)
  expect(name.startsWith(`${t.line} ${w.to} ${t.headsign},`)).toBe(true)
  const vpanel = page.getByRole('dialog', { name: new RegExp(`${w.to} ${esc(t.headsign)}`) })
  await expect(vpanel).toBeVisible()
  await expect(mapEl(page)).toHaveAttribute('data-spotlight', key)
  await ringClear(page, expect, vpanel, o.lang, phone, 'row in the race', map1)
  await step('at rest')
}
