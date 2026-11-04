import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { pillOf, box } from './lib.ts'
// latest-phone at 412 (Pixel 7) and 360, en and da
export default async ({ page, step, expect }: Journey) => {
  for (const w of [412, 360]) for (const lang of ['en', 'da'] as const) {
    if (w === 360) await page.setViewportSize({ width: 360, height: 800 })
    await page.goto('/' + lang)
    const pill = pillOf(page, lang)
    await expect(pill).toBeVisible({ timeout: 60000 })
    const about = page.getByRole('button', { name: lang === 'en' ? 'About Mylder' : 'Om Mylder' })
    const pb = await box(page, pill), ab = await box(page, about), glass = await box(page, pill.locator('xpath=..'))
    const vw = page.viewportSize()!.width
    expect(pb.top).toBeGreaterThanOrEqual(ab.bottom)
    expect(pb.left).toBeGreaterThanOrEqual(0); expect(pb.right).toBeLessThanOrEqual(vw)
    expect(pb.left).toBeGreaterThanOrEqual(glass.left - 0.5); expect(pb.right).toBeLessThanOrEqual(glass.right + 0.5)
    expect(await pill.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true)
    for (const part of [pill.getByText(lang === 'en' ? 'Latest now' : 'Mest forsinket nu'), pill.locator('.pn-Delay')]) {
      const b = await box(page, part); expect(b.left).toBeGreaterThanOrEqual(pb.left); expect(b.right).toBeLessThanOrEqual(pb.right + 0.5)
    }
    const where = pill.locator('[data-latest-where]')
    const shown = await where.evaluate((e) => { const s = e as HTMLElement; return { text: s.innerText, sw: s.scrollWidth, cw: s.clientWidth } })
    console.log(w, lang, JSON.stringify(shown))
    const heading = page.getByRole('heading', { name: lang === 'en' ? 'Overview' : 'Overblik' })
    if (await heading.isVisible()) { const hb = await box(page, heading); const bb = await box(page, page.getByRole('banner')); expect(hb.top).toBeGreaterThanOrEqual(bb.bottom) }
    await step(`${w} ${lang}`)
  }
}
