import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { mapEl } from './lib.ts'
import { W, snapshot, spills } from './p.ts'

/** Quiet: the pill names no trip and doesn't open the panel; a panel open as the feed goes quiet. */
export default async ({ page, step, expect }: Journey) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/en')
  await expect.poll(async () => (await snapshot(page)).updates.fresh, { timeout: 560000, intervals: [5000] }).toBe(false)
  const quiet = page.getByRole('banner').getByText('Delays from Rejseplanen not updated since 09:56')
  await expect(quiet).toBeVisible({ timeout: 90000 })
  await page.waitForTimeout(1500)
  // fresh page: the quiet pill doesn't open the panel
  for (const lang of ['en', 'da'] as const) {
    await page.goto('/' + lang)
    const q = page.getByRole('banner').getByText(lang === 'en' ? 'Delays from Rejseplanen not updated since 09:56' : 'Forsinkelser fra Rejseplanen ikke opdateret siden 09:56')
    await expect(q).toBeVisible({ timeout: 60000 })
    await expect(page.getByRole('banner').getByRole('button', { name: lang === 'en' ? /^Biggest delay/ : /^Største forsinkelse/ })).toHaveCount(0)
    const isButton = await q.evaluate((e) => !!e.closest('button'))
    console.log(lang, 'quiet text inside a button:', isButton)
    await step(`quiet pill ${lang}`)
    await q.click({ force: true })
    await page.waitForTimeout(1500)
    console.log(lang, 'after click address', new URL(page.url()).search)
    expect(new URL(page.url()).searchParams.get('latest'), 'quiet pill opens no panel').toBeNull()
    await expect(page.getByRole('dialog', { name: W[lang].title })).toHaveCount(0)
    await expect(mapEl(page)).not.toHaveAttribute('data-spotlight', /.*/)
    await step(`quiet pill pressed ${lang}`)
  }
  // the link while quiet
  await page.goto('/en?latest=now')
  await page.waitForTimeout(5000)
  const d = page.getByRole('dialog', { name: 'Latest right now' })
  console.log('link while quiet:', await d.isVisible() ? JSON.stringify(await d.innerText()) : '(no panel)', 'spotlight', await mapEl(page).getAttribute('data-spotlight'))
  await expect(mapEl(page)).not.toHaveAttribute('data-spotlight', /.*/)
  await step('link while quiet')
}
