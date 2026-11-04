import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { pillOf, box, headerBottom } from './lib.ts'
// latest-wide: 800..1920, en; da at 1280 and 1440; resize 1440 -> 1000 -> 1440
export default async ({ page, step, expect }: Journey) => {
  const check = async (w: number, lang: 'en' | 'da', shot: boolean) => {
    const pill = pillOf(page, lang)
    await expect(pill).toBeVisible({ timeout: 60000 })
    await expect(page.getByRole('group', { name: lang === 'en' ? 'Filters' : 'Filtre' }).getByRole('button')).toHaveCount(6)
    expect(await pill.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true)
    const pb = await box(page, pill)
    for (const part of [pill.getByText(lang === 'en' ? 'Latest now' : 'Mest forsinket nu'), pill.locator('.pn-Delay')]) { const b = await box(page, part); expect(b.left).toBeGreaterThanOrEqual(pb.left); expect(b.right).toBeLessThanOrEqual(pb.right + 0.5) }
    const inBar = await pill.evaluate((e) => e.closest('.pn-TopBar') !== null)
    if (inBar) {
      const m = await box(page, page.getByRole('link', { name: 'Mylder' })); const a = await box(page, page.getByRole('button', { name: lang === 'en' ? 'About Mylder' : 'Om Mylder' }))
      expect(Math.abs((m.top + m.bottom) / 2 - (a.top + a.bottom) / 2)).toBeLessThan(3)
      expect(await page.locator('.pn-TopBar').evaluate((e) => e.getBoundingClientRect().height)).toBeLessThanOrEqual(58)
    }
    const hb = await headerBottom(page)
    const ov = await box(page, page.getByRole('heading', { name: lang === 'en' ? 'Overview' : 'Overblik' }))
    expect(ov.top).toBeGreaterThanOrEqual(hb)
    const where = await pill.locator('[data-latest-where]').evaluate((e) => (e as HTMLElement).innerText)
    console.log(w, lang, inBar ? 'in bar' : 'on its row', 'header bottom', hb, where)
    if (shot) await step(`${w} ${lang} ${inBar ? 'in bar' : 'row'}`)
  }
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/en')
  for (const w of [800, 900, 1000, 1100, 1280, 1440, 1920]) { await page.setViewportSize({ width: w, height: 800 }); await page.waitForTimeout(400); await check(w, 'en', [800, 1280, 1440].includes(w)) }
  for (const w of [1440, 1000, 1440]) { await page.setViewportSize({ width: w, height: 800 }); await page.waitForTimeout(400); await check(w, 'en', false) }
  // a press: the trip panel's heading below the header
  await page.setViewportSize({ width: 1280, height: 800 })
  await pillOf(page).click()
  const d = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: 'Follow' }) })
  await expect(d).toBeVisible()
  expect((await box(page, d.getByRole('heading').first())).top).toBeGreaterThanOrEqual(await headerBottom(page))
  await step('1280 pressed')
  await page.goto('/da')
  for (const w of [1280, 1440]) { await page.setViewportSize({ width: w, height: 800 }); await page.waitForTimeout(400); await check(w, 'da', true) }
}
