import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto('/da')
  const pill = page.getByRole('banner').getByRole('button', { name: /^Største forsinkelse lige nu: / })
  await expect(pill).toBeVisible({ timeout: 90000 })
  console.log('DOM ' + await pill.evaluate((e) => e.outerHTML))
  await step('probe')
}
