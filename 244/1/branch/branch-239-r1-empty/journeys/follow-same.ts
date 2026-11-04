import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { esc, top, pillOf } from './lib.ts'
/** Follow on the pill's own trip, then a press on the pill: Follow goes off. */
export default async ({ page, step, expect }: Journey) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/en')
  const pill = pillOf(page)
  await expect(pill).toBeVisible({ timeout: 60000 })
  const updated = page.getByRole('banner').getByText(/^Updated /)
  const u0 = await updated.textContent()
  await expect(updated).not.toHaveText(u0!, { timeout: 70000 })
  await page.waitForTimeout(1000)
  const t = (await top(page))!
  await pill.click()
  const d = page.getByRole('dialog', { name: new RegExp(`to ${esc(t.headsign)}`) })
  await expect(d).toBeVisible()
  await page.waitForTimeout(3000)
  await d.getByRole('button', { name: 'Follow' }).click()
  await expect(d.getByRole('button', { name: 'Follow' })).toHaveAttribute('aria-pressed', 'true')
  await page.waitForTimeout(3000)
  await step('following the pill trip')
  await pill.click()
  await page.waitForTimeout(3000)
  await step('pill pressed again')
  await expect(d.getByRole('button', { name: 'Follow' })).toHaveAttribute('aria-pressed', 'false')
}
