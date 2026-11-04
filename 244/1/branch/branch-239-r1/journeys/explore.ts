import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/en')
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible({ timeout: 60000 })
  const pill = page.getByRole('banner').getByRole('button', { name: /^Biggest delay right now: / })
  await expect(pill).toBeVisible({ timeout: 60000 })
  await step('loaded')
  const map = page.locator('[data-vehicles]')
  console.log(await map.evaluate((e) => e.outerHTML.slice(0, 400)))
  await pill.click()
  await page.waitForTimeout(4000)
  await step('pressed')
  console.log(page.url())
  console.log(await map.evaluate((e) => [...e.attributes].map((a) => `${a.name}=${a.value}`).join(' ')))
  console.log(await page.locator('body').ariaSnapshot())
}
