import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { esc, top, pillOf } from './lib.ts'
// latest-standout + latest-open + latest-da, Desktop Chrome size
export default async ({ page, step, expect }: Journey) => {
  for (const lang of ['en', 'da'] as const) {
    await page.goto('/' + lang)
    const pill = pillOf(page, lang)
    await expect(pill).toBeVisible({ timeout: 60000 })
    let t: any
    await expect(async () => {
      t = await top(page)
      const n = Math.round(t.mins)
      if (lang === 'en') {
        await expect(pill).toHaveAccessibleName(new RegExp(`^Biggest delay right now: ${esc(t.line)} to ${esc(t.headsign)}, ${n} min late, (between .+ and .+|at .+)$`))
        await expect(pill).toContainText('Latest now'); await expect(pill).toContainText(`+${n} min`); await expect(pill).toContainText(/at \S/)
      } else {
        await expect(pill).toHaveAccessibleName(new RegExp(`^Største forsinkelse lige nu: ${esc(t.line)} mod ${esc(t.headsign)}, ${n} min forsinket, `))
        await expect(pill).toContainText('Mest forsinket nu'); await expect(pill).toContainText(/ved \S/)
      }
      expect(n).toBeGreaterThanOrEqual(3)
    }).toPass({ timeout: 70000 })
    await step(`${lang} pill names ${t.line}`)
    await pill.click()
    await expect(page).toHaveURL(new RegExp(`[?&]trip=${esc(encodeURIComponent(t.key))}`))
    const d = page.getByRole('dialog', { name: new RegExp(`${lang === 'en' ? 'to' : 'mod'} ${esc(t.headsign)}`) })
    await expect(d).toBeVisible()
    await expect(d.getByText(t.line, { exact: true }).first()).toBeVisible()
    await step(`${lang} pressed: panel open`)
  }
}
