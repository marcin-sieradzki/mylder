import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { mapEl, ringAt } from './lib.ts'
/** Calm (crowded) or none (empty): the pill names no trip and nothing on the map is ringed, even with a trip's panel open. */
export default async ({ page, step, expect }: Journey) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/en')
  const which = process.env.STATE
  const text = page.getByRole('banner').getByText(which === 'calm' ? /^Latest now [+]\d+ min at most$/ : /^Latest now —/)
  await expect(text).toBeVisible({ timeout: 60000 })
  await expect(page.getByRole('banner').getByRole('button', { name: /^Biggest delay/ })).toHaveCount(0)
  await step(`${which} pill`)
  expect(await mapEl(page).getAttribute('data-spotlight')).toBeNull()
  await text.click({ force: true }).catch(() => {})
  await page.waitForTimeout(1500)
  expect(await mapEl(page).getAttribute('data-spotlight')).toBeNull()
  await page.getByRole('dialog', { name: 'Overview' }).getByRole('tab', { name: /^Vehicles/ }).click()
  await page.getByRole('table', { name: 'Vehicles' }).getByRole('link').first().click()
  await expect(page).toHaveURL(/[?&]trip=/)
  await page.waitForTimeout(2000)
  const s = await mapEl(page).evaluate((e) => [e.getAttribute('data-spotlight'), e.getAttribute('data-spotlight-at')])
  const r = await ringAt(page, 640, 400, { left: 390, top: 140, right: 900, bottom: 798 }, false)
  console.log(which, 'spotlight attrs', JSON.stringify(s), 'red ring pixels on the map', JSON.stringify(r))
  await step(`${which}: a trip open, no ring`)
  expect(s[0]).toBeNull()
  expect(r.elsewhere).toBeLessThan(20)
}
