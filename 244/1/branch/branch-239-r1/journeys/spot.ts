import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { esc, top, pillOf, mapEl, spot, mapParam, waitLanded, headerBottom, ringAt, box } from './lib.ts'

/** Pass rule 1/2/4: press the pill, the camera lands the named trip's dot clear of the header and the panel,
 * a danger-red ring sits on it and nowhere else, it follows the dot, a hover names the trip, Close removes it. */
export async function spotlight({ page, step, expect }: Journey, o: { width?: number; lang: 'en' | 'da'; phone?: boolean }) {
  if (o.width) await page.setViewportSize({ width: o.width, height: 800 })
  await page.goto('/' + o.lang)
  await expect(page.getByRole('banner').getByText(o.lang === 'en' ? /^Updated / : /^Opdateret /)).toBeVisible({ timeout: 60000 })
  const pill = pillOf(page, o.lang)
  await expect(pill).toBeVisible({ timeout: 60000 })
  let t: any
  await expect(async () => {
    t = await top(page)
    const name = (await pill.getAttribute('aria-label')) ?? (await pill.textContent())
    const n = await pill.evaluate((e) => e.getAttribute('aria-label') || (e as HTMLElement).innerText)
    const acc = await pill.evaluate((e) => e.textContent)
    expect(t).toBeTruthy()
    await expect(pill).toHaveAccessibleName(new RegExp(`^(Biggest delay right now|Største forsinkelse lige nu): ${esc(t.line)} (to|mod) ${esc(t.headsign)}, `))
  }).toPass({ timeout: 70000 })
  console.log('top', JSON.stringify(t))
  if (!o.phone) await expect(page.getByRole('dialog', { name: o.lang === 'en' ? 'Overview' : 'Overblik' })).toBeVisible()
  const before = await spot(page)
  console.log('before press', JSON.stringify(before), 'map', mapParam(page))
  expect(before.key, 'no spotlight before the press').toBeNull()
  // press just after a snapshot lands, so no minute's snapshot lands during the flight (see race.ts for that case)
  const updated = page.getByRole('banner').getByText(o.lang === 'en' ? /^Updated / : /^Opdateret /)
  const u0 = await updated.textContent()
  await expect(updated).not.toHaveText(u0!, { timeout: 70000 })
  await page.waitForTimeout(1500)
  await expect(async () => {
    t = await top(page)
    await expect(pill).toHaveAccessibleName(new RegExp(`^(Biggest delay right now|Største forsinkelse lige nu): ${esc(t.line)} (to|mod) ${esc(t.headsign)}, `))
  }).toPass({ timeout: 20000 })
  console.log('top at press', JSON.stringify(t), await updated.textContent())
  await step('before press')
  await pill.click()
  await step('pressed')
  await expect(page).toHaveURL(new RegExp(`[?&]trip=${esc(encodeURIComponent(t.key))}`))
  const panel = page.getByRole('dialog', { name: new RegExp(`${o.lang === 'en' ? 'to' : 'mod'} ${esc(t.headsign)}`) })
  await expect(panel).toBeVisible()
  const landed = await waitLanded(page)
  console.log('landed map', landed)
  const s = await spot(page)
  console.log('spotlight', JSON.stringify(s))
  await step('landed')
  expect(s.key, 'data-spotlight names the trip in ?trip=').toBe(t.key)
  const [x, y] = s.at!.split(' ').map(Number)
  const hb = await headerBottom(page)
  const vp = page.viewportSize()!
  const pb = await box(page, panel)
  const notices = await page.locator('[role=status]:visible').evaluateAll((els) => els.filter((e) => !e.closest('[role=dialog]')).map((e) => { const r = e.getBoundingClientRect(); return { text: (e as HTMLElement).innerText.slice(0, 40), left: r.left, top: r.top, right: r.right, bottom: r.bottom } }))
  const legend = await box(page, page.getByRole('list', { name: o.lang === 'en' ? 'Data states' : 'Datatilstande' })).catch(() => null)
  const geom: any = { x, y, headerBottom: hb, panel: pb, vp, notices, legend }
  let clear = { left: 0, top: hb, right: vp.width, bottom: vp.height }
  if (!o.phone) {
    const ob = await box(page, page.getByRole('dialog', { name: o.lang === 'en' ? 'Overview' : 'Overblik' }))
    geom.overview = ob
    console.log('geom', JSON.stringify(geom))
    expect(y - 12, 'ring top below the header').toBeGreaterThan(hb)
    expect(x - 12, 'ring left of it right of the Overview sheet').toBeGreaterThan(ob.right)
    expect(x + 12, 'ring right edge left of the trip panel').toBeLessThan(pb.left)
    expect(y + 12, 'ring inside the viewport').toBeLessThan(vp.height)
    clear = { left: ob.right, top: hb, right: pb.left, bottom: vp.height }
  } else {
    console.log('geom', JSON.stringify(geom))
    expect(y - 12, 'ring top below the header').toBeGreaterThan(hb)
    expect(y + 12, 'ring above the panel').toBeLessThan(pb.top)
    if (legend) {
      const overLegend = x + 12 > legend.left && x - 12 < legend.right && y + 12 > legend.top && y - 12 < legend.bottom
      console.log('legend', overLegend ? 'RING UNDER THE LEGEND' : 'ring clear of the legend card', y + 12 < legend.top ? '(above its top)' : '(beside it)')
      expect(overLegend, 'ring not under the legend card').toBe(false)
    }
    expect(x - 12).toBeGreaterThan(0)
    expect(x + 12).toBeLessThan(vp.width)
    clear = { left: 0, top: hb, right: vp.width, bottom: Math.min(pb.top, legend?.top ?? vp.height) }
  }
  for (const n of notices) {
    const overlaps = x + 12 > n.left && x - 12 < n.right && y + 12 > n.top && y - 12 < n.bottom
    console.log('notice', n.text, overlaps ? 'OVERLAPS RING' : 'clear of ring')
  }
  const r1 = await ringAt(page, x, y, clear)
  console.log('ring pixels', JSON.stringify(r1))
  expect(r1.sectors, 'a danger-red ring all round the dot').toBeGreaterThanOrEqual(14)
  // follows the dot
  await page.waitForTimeout(8000)
  const s2 = await spot(page)
  const [x2, y2] = s2.at!.split(' ').map(Number)
  const r2 = await ringAt(page, x2, y2, clear)
  console.log('after 8 s', JSON.stringify(s2), 'map', mapParam(page), JSON.stringify(r2))
  expect(r2.sectors).toBeGreaterThanOrEqual(14)
  await step('ring 8 s later')
  await page.mouse.move(5, vp.height / 2)
  await page.waitForTimeout(300)
  await expect(async () => {
    const s3 = await spot(page)
    const [x3, y3] = s3.at!.split(' ').map(Number)
    await page.mouse.move(x3, y3)
    await expect(page.getByRole('tooltip')).toContainText(`${t.line} ${o.lang === 'en' ? 'to' : 'mod'} ${t.headsign}`, { timeout: 1500 })
  }).toPass({ timeout: 15000 })
  await step('hover on ring')
  await page.mouse.move(5, vp.height / 2)
  const s4 = await spot(page)
  const [x4, y4] = s4.at!.split(' ').map(Number)
  await panel.getByRole('button', { name: o.lang === 'en' ? 'Close' : 'Luk' }).click()
  await expect(panel).toBeHidden()
  await expect(page).not.toHaveURL(/[?&]trip=/)
  await expect(mapEl(page)).not.toHaveAttribute('data-spotlight', /.*/)
  await expect(mapEl(page)).not.toHaveAttribute('data-spotlight-at', /.*/)
  await page.waitForTimeout(500)
  const r5 = await ringAt(page, x4, y4, undefined, false)
  console.log('after close at last ring point', JSON.stringify(r5))
  expect(r5.sectors, 'no ring once closed').toBeLessThanOrEqual(2)
  await step('closed')
}
