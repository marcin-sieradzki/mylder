import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  const v = page.locator('[data-vehicles]')
  await expect(v).not.toHaveAttribute('data-vehicles', '0')
  await page.getByRole('region', { name: 'Live map of Copenhagen' }).focus()
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowUp')
  for (let i = 0; i < 2; i++) await page.keyboard.press('Shift+ArrowRight')
  await expect(v).toHaveAttribute('data-tilt', '30', { timeout: 15000 })
  await expect(v).toHaveAttribute('data-heading', '30')
  await expect(page.getByText(/\d+\s(m|km)$/)).toBeHidden()
  await step('tilted and turned')
  await page.getByRole('button', { name: 'Centre the map' }).click()
  await expect(v).toHaveAttribute('data-tilt', '0', { timeout: 15000 })
  await expect(page.getByText(/\d+\s(m|km)$/)).toBeVisible()
  await step('back flat')
}
