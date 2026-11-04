import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { esc, top, pillOf, spot, mapEl, mapParam, waitLanded, headerBottom, box, diff, chrome } from './lib.ts'

/** The map stays a map: with the dots paused, the picture with the pill's trip picked (panel open, ring on)
 * and the picture once it is closed differ only in the ring, zoomed out where many dots show. */
export default async ({ page, step, expect }: Journey) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/en')
  const pill = pillOf(page)
  await expect(pill).toBeVisible({ timeout: 60000 })
  const updated = page.getByRole('banner').getByText(/^Updated /)
  const u0 = await updated.textContent()
  await expect(updated).not.toHaveText(u0!, { timeout: 70000 })
  await page.waitForTimeout(1500)
  const t = (await top(page))!
  await page.getByRole('toolbar', { name: 'Map controls' }).getByRole('button', { name: 'Pause' }).click()
  await step('paused')
  await pill.click()
  const trip = page.getByRole('dialog', { name: new RegExp(`to ${esc(t.headsign)}`) })
  await expect(trip).toBeVisible()
  await waitLanded(page)
  await step('pressed, landed')
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Zoom out' }).click()
  await waitLanded(page)
  await page.mouse.move(5, 400)
  await page.waitForTimeout(2000)
  const camA = mapParam(page)
  const nA = await mapEl(page).getAttribute('data-vehicles')
  const s = await spot(page)
  const legendBoxes = async () => { const l = page.getByRole('list', { name: 'Data states' }); const out = [await box(page, l), await box(page, l.locator('xpath=..')), await box(page, l.locator('xpath=../..'))]; const sc = page.getByText(/^\d+\s(m|km)$/); if (await sc.isVisible()) { out.push(await box(page, sc.locator('xpath=..'))); out.push(await box(page, sc.locator('xpath=../..'))) } return out }
  const chromeA = [...(await chrome(page)), ...(await legendBoxes())]
  const shotA = await page.screenshot()
  await step('zoomed out, picked (A)')
  const hb = await headerBottom(page)
  const ob = await box(page, page.getByRole('dialog', { name: 'Overview' }))
  const pb = await box(page, trip)
  await trip.getByRole('button', { name: 'Close' }).click()
  await expect(trip).toBeHidden()
  await page.mouse.move(5, 400)
  await page.waitForTimeout(2000)
  const camB = mapParam(page)
  const nB = await mapEl(page).getAttribute('data-vehicles')
  const chromeB = [...(await chrome(page)), ...(await legendBoxes())]
  const shotB = await page.screenshot()
  await step('closed (B)')
  console.log('camera A', camA, 'B', camB, 'vehicles A', nA, 'B', nB, 'spotlight in A', JSON.stringify(s), await updated.textContent())
  expect(s.key).toBe(t.key)
  expect(camB).toBe(camA)
  expect(nB).toBe(nA)
  const [x, y] = s.at!.split(' ').map(Number)
  const rect = { left: ob.right + 2, top: hb + 2, right: pb.left - 2, bottom: 798 }
  const skip = [...chromeA, ...chromeB]
  const d1 = await diff(page, shotA, shotB, rect, x, y, 16, skip)
  const d0 = await diff(page, shotA, shotB, rect, x, y, 0, skip)
  console.log('left out', JSON.stringify(skip))
  console.log('rect', JSON.stringify(rect), 'ring at', x, y)
  console.log('A vs B outside the ring', JSON.stringify(d1), '| with the ring', JSON.stringify(d0))
  expect(d0.changed, 'the ring itself differs').toBeGreaterThan(50)
  expect(d1.changed, 'no map pixel outside the ring differs').toBeLessThan(30)
}
