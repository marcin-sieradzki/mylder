import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { esc, top, pillOf, spot, mapEl, waitLanded, ringAt } from './lib.ts'
/** On the quiet moment: the ring drawn from a press while delays come goes once the pill turns quiet, and a quiet pill draws none. */
export default async ({ page, step, expect }: Journey) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/en')
  const pill = pillOf(page)
  await expect(pill).toBeVisible({ timeout: 90000 })
  const t = (await top(page))!
  console.log('top', JSON.stringify(t))
  await pill.click()
  const panel = page.getByRole('dialog', { name: new RegExp(`to ${esc(t.headsign)}`) })
  await expect(panel).toBeVisible()
  await waitLanded(page)
  const s = await spot(page)
  console.log('spotlight while fresh', JSON.stringify(s))
  expect(s.key).toBe(t.key)
  await step('pressed while delays come: ring')
  await expect.poll(async () => (await (await page.request.get('/api/snapshot')).json()).updates.fresh, { timeout: 9 * 60000, intervals: [10000] }).toBe(false)
  const quiet = page.getByRole('banner').getByText('Delays from Rejseplanen not updated since 09:56')
  await expect(quiet).toBeVisible({ timeout: 70000 })
  await expect(pillOf(page)).toHaveCount(0)
  await page.waitForTimeout(1500)
  const s2 = await spot(page)
  console.log('after quiet', JSON.stringify(s2), 'trip in address', new URL(page.url()).searchParams.get('trip'), 'panel open', await panel.isVisible())
  await step('quiet: no ring')
  expect(s2.key, 'no spotlight once quiet').toBeNull()
  if (s.at) { const [x, y] = s.at.split(' ').map(Number); const r = await ringAt(page, x, y, { left: 390, top: 140, right: 900, bottom: 798 }, false); console.log('red ring pixels on the map', JSON.stringify(r)); expect(r.sectors).toBeLessThanOrEqual(2); expect(r.elsewhere).toBeLessThan(20) }
}
