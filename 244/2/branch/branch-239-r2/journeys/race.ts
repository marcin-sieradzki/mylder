import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { esc, top, pillOf, spot, mapParam, waitLanded, headerBottom, box } from './lib.ts'

/** Press the pill at the moment the page asks for the minute's snapshot, so it lands during the flight,
 * as a rider pressing near the minute does. Three tries, one a minute. */
export default async ({ page, step, expect }: Journey) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/en')
  const pill = pillOf(page)
  await expect(pill).toBeVisible({ timeout: 60000 })
  const updated = page.getByRole('banner').getByText(/^Updated /)
  const results: string[] = []
  for (let i = 1; i <= 4; i++) {
    const t = await top(page)
    const asked = page.waitForRequest((r) => r.url().includes('/api/snapshot'), { timeout: 75000 })
    await asked
    const u0 = await updated.textContent()
    await pill.click()
    const tt = await top(page)
    await step(`try ${i} pressed as the snapshot is fetched`)
    const key = new URL(page.url()).searchParams.get('trip')
    await waitLanded(page)
    const s = await spot(page)
    const [x, y] = s.at!.split(' ').map(Number)
    const hb = await headerBottom(page)
    const panel = page.getByRole('dialog', { name: /^.* to / }).filter({ hasNot: page.getByRole('tab') })
    const pb = await box(page, page.getByRole('dialog').filter({ has: page.getByRole('button', { name: 'Follow' }) }))
    const ob = await box(page, page.getByRole('dialog', { name: 'Overview' }))
    const clear = y - 12 > hb && x - 12 > ob.right && x + 12 < pb.left && y + 12 < 800
    const line = `try ${i}: ${u0} -> ${await updated.textContent()}; pill trip ${key} (top before ${t?.key}@${t?.mins}, after ${tt?.key}@${tt?.mins}); spotlight ${s.key} at ${s.at}; header ${hb}; sheet right ${ob.right}; panel left ${pb.left}; ${clear ? 'CLEAR' : 'NOT CLEAR'}`
    console.log(line)
    results.push(line)
    await step(`try ${i} landed ${clear ? 'clear' : 'not clear'}`)
    await page.getByRole('dialog').filter({ has: page.getByRole('button', { name: 'Follow' }) }).getByRole('button', { name: 'Close' }).click()
    await page.waitForTimeout(1000)
  }
  const bad = results.filter((r) => r.includes('NOT CLEAR'))
  expect(bad, 'every landing clear of the header, sheet and panel').toEqual([])
}
