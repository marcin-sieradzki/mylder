import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { esc, top, pillOf, spot, mapParam, waitLanded, ringAt } from './lib.ts'

/** When a later snapshot names another trip latest, the camera and the ring stay on the picked trip, and the pill names the new one. */
export default async ({ page, step, expect }: Journey) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/en')
  const pill = pillOf(page)
  await expect(pill).toBeVisible({ timeout: 60000 })
  const updated = page.getByRole('banner').getByText(/^Updated /)
  const u0 = await updated.textContent()
  await expect(updated).not.toHaveText(u0!, { timeout: 70000 })
  await page.waitForTimeout(1000)
  const t1 = (await top(page))!
  await expect(pill).toHaveAccessibleName(new RegExp(`^Biggest delay right now: ${esc(t1.line)} to ${esc(t1.headsign)}, `))
  console.log('picked', JSON.stringify(t1), await updated.textContent())
  await pill.click()
  const panel = page.getByRole('dialog', { name: new RegExp(`to ${esc(t1.headsign)}`) })
  await expect(panel).toBeVisible()
  const cam = await waitLanded(page)
  await step(`picked ${t1.line}`)
  let t2: any
  const start = Date.now()
  while (Date.now() - start < 9 * 60000) {
    t2 = await top(page)
    if (t2 && t2.key !== t1.key) break
    await page.waitForTimeout(5000)
  }
  if (!t2 || t2.key === t1.key) throw new Error(`precondition not met: no snapshot named another trip latest within 9 minutes (still ${t1.key})`)
  console.log('next latest', JSON.stringify(t2), 'after', Math.round((Date.now() - start) / 1000), 's')
  await expect(pill).toHaveAccessibleName(new RegExp(`^Biggest delay right now: ${esc(t2.line)} to ${esc(t2.headsign)}, `), { timeout: 15000 })
  await page.waitForTimeout(2000)
  await step(`pill names ${t2.line}`)
  expect(new URL(page.url()).searchParams.get('trip'), 'the panel stays on the picked trip').toBe(t1.key)
  await expect(panel).toBeVisible()
  expect(mapParam(page), 'the camera has not moved').toBe(cam)
  const s = await spot(page)
  console.log('spotlight', JSON.stringify(s), 'camera', mapParam(page))
  expect(s.key, 'the ring stays on the picked trip').toBe(t1.key)
  const [x, y] = s.at!.split(' ').map(Number)
  if (x > 400 && x < 890 && y > 140 && y < 790) {
    const r = await ringAt(page, x, y)
    console.log('ring pixels at the picked trip', JSON.stringify(r))
    expect(r.sectors).toBeGreaterThanOrEqual(14)
    await page.mouse.move(5, 400)
    await expect(async () => {
      const [xx, yy] = (await spot(page)).at!.split(' ').map(Number)
      await page.mouse.move(xx, yy)
      await expect(page.getByRole('tooltip')).toContainText(`${t1.line} to ${t1.headsign}`, { timeout: 1500 })
    }).toPass({ timeout: 15000 })
    await step('hover on the ring: still the picked trip')
  } else console.log('the picked trip has run off the view at', x, y)
}
