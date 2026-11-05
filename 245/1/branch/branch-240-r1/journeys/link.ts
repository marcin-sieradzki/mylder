import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { esc, mapEl, mapParam } from './lib.ts'
import { W, type Lang, snapshot, ranking, dims, startSampler, ringClear, spills } from './p.ts'

/** The panel's address loaded cold opens it on the trip running latest now, rung, flown to; its head agrees
 * with that trip's own vehicle panel; with the panel open, the next minute keeps the picked trip. */
export async function link({ page, step, expect }: Journey, o: { width?: number; lang: Lang; phone?: boolean }) {
  const w = W[o.lang]
  const phone = !!o.phone
  await dims(page, o.width)
  const before = ranking(await snapshot(page))
  await page.goto(`/${o.lang}?latest=now`)
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)))
  await mapEl(page).waitFor()
  await startSampler(page)
  const panel = page.getByRole('dialog', { name: w.title })
  await expect(panel).toBeVisible({ timeout: 60000 })
  const card = panel.getByRole('region', { name: w.card })
  await expect(card).toBeVisible({ timeout: 60000 })
  await step('cold load')
  await expect(mapEl(page)).toHaveAttribute('data-spotlight', /.+/, { timeout: 60000 })
  const key = (await mapEl(page).getAttribute('data-spotlight'))!
  const after = ranking(await snapshot(page))
  console.log('picked', key, 'top before/after load', before[0]?.key, after[0]?.key)
  expect([before[0]?.key, after[0]?.key], 'picked = the trip running latest as the page loads').toContain(key)
  const t = (await snapshot(page)).trips.find((x: any) => x.key === key)
  await expect(card.getByRole('heading', { name: `${w.to} ${t.headsign}` })).toBeVisible()
  expect(new URL(page.url()).searchParams.get('latest')).toBe('now')
  await ringClear(page, expect, panel, o.lang, phone, 'cold link', null)
  await step('flown to, at rest')
  const bad = await spills(panel)
  console.log('spills', JSON.stringify(bad))
  expect(bad).toEqual([])
  // compare with the trip's own vehicle panel
  const dd = async (loc: any) => (await loc.locator('dt', { hasText: w.nextStop }).locator('xpath=following-sibling::dd[1]').innerText()).replace(/\s+/g, ' ').trim()
  const cardNext = await dd(card)
  const cardDelay = (await card.locator('.pn-Delay').first().innerText()).trim()
  const cardState = (await card.locator('.pn-VehicleDotLabel').innerText()).trim()
  const v = await page.context().newPage()
  await v.setViewportSize(page.viewportSize()!)
  await v.goto(`/${o.lang}?trip=${encodeURIComponent(key)}`)
  const vp = v.getByRole('dialog', { name: new RegExp(`${w.to} ${esc(t.headsign)}`) })
  await expect(vp).toBeVisible({ timeout: 60000 })
  await expect(vp.locator('dt', { hasText: w.nextStop })).toBeVisible({ timeout: 30000 })
  const vt = (await vp.innerText()).split('\n').map((l: string) => l.trim()).filter(Boolean)
  await expect(vp).not.toContainText(/(Next stop|Næste stop)\s*—/, { timeout: 20000 })
  const vNext = (await vp.innerText()).replace(/\s+/g, ' ')
  console.log('vehicle panel facts:', JSON.stringify(vt.slice(0, 16)))
  const vDelay = (await vp.locator('.pn-Delay').first().innerText()).trim()
  const vState = (await vp.locator('.pn-VehicleDotLabel').first().innerText().catch(() => '?')).trim()
  console.log('card:', cardNext, '|', cardDelay, '|', cardState)
  console.log('vehicle panel:', vNext.slice(0, 300), '|', vDelay, '|', vState)
  await v.screenshot({ path: `.verify/branch-240-r1/${o.phone ? 'link-phone' : 'link'}-${o.width ?? 412}-${o.lang}-vehicle-panel.png` })
  await v.close()
  expect(cardState, 'same state word').toBe(vState)
  expect(cardDelay, 'same delay').toBe(vDelay)
  const nm = cardNext.split(/ (Timetabled|Planlagt) /)[0]
  console.log('next stop name', nm)
  expect(vNext, 'same next stop').toContain(`${w.nextStop} ${nm}`)
  // the next minute: the card keeps the picked trip, the ring stays
  const u = page.getByRole('banner').getByText(w.updated)
  const u0 = await u.textContent()
  const m0 = mapParam(page)
  await expect(u).not.toHaveText(u0!, { timeout: 75000 })
  await page.waitForTimeout(1500)
  const top = ranking(await snapshot(page))[0]?.key
  console.log('next minute: top now', top, 'ring', await mapEl(page).getAttribute('data-spotlight'), 'map', m0, '->', mapParam(page))
  await expect(mapEl(page)).toHaveAttribute('data-spotlight', key)
  await expect(card.getByRole('heading', { name: `${w.to} ${t.headsign}` })).toBeVisible()
  expect(mapParam(page), 'the camera does not move again').toBe(m0)
  await step('next minute, same trip')
}
