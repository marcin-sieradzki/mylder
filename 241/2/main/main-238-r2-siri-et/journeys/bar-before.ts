import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// The top bar's rows at each width, without regard to the pill, for comparing main with the branch.
const LANG = (process.env.LANG_UNDER_TEST ?? 'en') as 'en' | 'da'
const WIDTHS = [360, 412, 800, 900, 1000, 1100, 1280, 1440, 1920]
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/' + LANG)
  const banner = page.getByRole('banner')
  await expect(banner.locator('fieldset button')).toHaveCount(6, { timeout: 60000 })
  const rows: any[] = []
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 800 })
    await page.waitForTimeout(1500)
    rows.push(await page.evaluate((w) => {
      const bar = document.querySelector('header .pn-TopBar')!.getBoundingClientRect(); const header = document.querySelector('header')!.getBoundingClientRect()
      const tools = document.querySelector('header .pn-TopBar-tools')!.getBoundingClientRect(); const brand = document.querySelector('header .pn-TopBar-brand')!.getBoundingClientRect()
      const ov = Array.from(document.querySelectorAll('[role=dialog]')).map((d) => d.getBoundingClientRect().top)
      return { w, barH: Math.round(bar.height), headerB: Math.round(header.bottom), toolsTop: Math.round(tools.top), brandTop: Math.round(brand.top), dialogTops: ov.map(Math.round) }
    }, w))
    await step(LANG + ' ' + w + 'px')
  }
  console.log('BAR ' + JSON.stringify(rows))
}
