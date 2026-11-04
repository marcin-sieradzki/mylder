import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  await expect(page.locator('[data-vehicles]')).not.toHaveAttribute('data-vehicles', '0')
  await page.waitForTimeout(3000)
  await step('phone chrome')
  const sw = await page.evaluate(() => document.documentElement.scrollWidth)
  if (sw > page.viewportSize()!.width) throw new Error('horizontal scroll ' + sw)
}
