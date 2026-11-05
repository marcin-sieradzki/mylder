import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { esc, top, pillOf } from './lib.ts'
// latest-standout and latest-da: the pill names the trip running latest, in both languages
export default async ({ page, step, expect }: Journey) => {
  for (const lang of ['en', 'da'] as const) {
    await page.goto('/' + lang)
    const pill = pillOf(page, lang)
    await expect(pill).toBeVisible({ timeout: 60000 })
    await expect(async () => {
      const t = (await top(page))!
      const re = lang === 'en' ? `^Biggest delay right now: ${esc(t.line)} to ${esc(t.headsign)}, ${t.mins} min late, (between .+ and .+|at .+)$` : `^Største forsinkelse lige nu: ${esc(t.line)} mod ${esc(t.headsign)}, ${t.mins} min forsinket, (mellem .+ og .+|ved .+)$`
      await expect(pill).toHaveAccessibleName(new RegExp(re), { timeout: 1000 })
      await expect(pill).toContainText(lang === 'en' ? 'Latest now' : 'Mest forsinket nu')
      await expect(pill).toContainText(`+${t.mins} min`)
    }).toPass({ timeout: 70000 })
    console.log(lang, await pill.getAttribute('aria-label'))
    await step(`pill ${lang}`)
  }
}
