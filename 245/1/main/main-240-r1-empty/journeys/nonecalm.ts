import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { mapEl } from './lib.ts'
import { W, spills, type Lang } from './p.ts'

/** None (empty): the pill reads "Latest now —" and opens no panel. Calm (crowded): it opens the panel with the list, no trip picked, no ring. */
export async function none({ page, step, expect }: Journey, lang: Lang) {
  await page.goto('/' + lang)
  const t = page.getByRole('banner').getByText(lang === 'en' ? /^Latest now —/ : /^Mest forsinket nu —/)
  await expect(t).toBeVisible({ timeout: 90000 })
  await expect(t).toContainText(lang === 'en' ? 'the Metro sends no delays' : 'Metroen sender ingen forsinkelser')
  console.log('in a button:', await t.evaluate((e) => !!e.closest('button')))
  await step('none')
  await t.click({ force: true })
  await page.waitForTimeout(1500)
  expect(new URL(page.url()).searchParams.get('latest'), 'none opens no panel').toBeNull()
  await expect(page.getByRole('dialog', { name: W[lang].title })).toHaveCount(0)
  await step('none pressed')
}

export async function calm({ page, step, expect }: Journey, o: { lang: Lang; width?: number; phone?: boolean }) {
  if (o.width) await page.setViewportSize({ width: o.width, height: 800 })
  await page.goto('/' + o.lang)
  const pill = page.getByRole('banner').getByRole('button', { name: o.lang === 'en' ? /^Latest now [+]?\d+ min at most$/ : /^Mest forsinket nu [+]?\d+ min højst$|^Mest forsinket nu/ })
  await expect(pill).toBeVisible({ timeout: 90000 })
  console.log('calm pill', await pill.getAttribute('aria-label'), '|', await pill.innerText())
  await expect(page.getByRole('banner').getByRole('button', { name: /^Biggest delay|^Største forsinkelse/ })).toHaveCount(0)
  await step('calm pill')
  await pill.click()
  const panel = page.getByRole('dialog', { name: W[o.lang].title })
  await expect(panel).toBeVisible()
  expect(new URL(page.url()).searchParams.get('latest')).toBe('now')
  const text = await panel.innerText()
  console.log('calm panel:', JSON.stringify(text))
  if (o.lang === 'en') expect(text).toMatch(/No trip runs 3 min late or more now\.|Every trip with a delay runs early now\./)
  const list = panel.getByRole('region', { name: o.lang === 'en' ? 'Latest trips' : 'Mest forsinkede ture' })
  await expect(list).toBeVisible()
  const n = await list.getByRole('button').count()
  console.log('rows', n, JSON.stringify(await list.getByRole('button').evaluateAll((b) => b.map((e) => e.getAttribute('aria-label')))))
  expect(n).toBeGreaterThan(0)
  expect(n).toBeLessThanOrEqual(5)
  await expect(panel.getByRole('region', { name: W[o.lang].card })).toHaveCount(0)
  await expect(panel.locator('[aria-current], [data-highlighted], [aria-selected=true]')).toHaveCount(0)
  await expect(mapEl(page)).not.toHaveAttribute('data-spotlight', /.*/)
  const bad = await spills(panel)
  console.log('spills', JSON.stringify(bad))
  await step('calm panel')
  expect(bad).toEqual([])
  await page.waitForTimeout(8000)
  await expect(mapEl(page)).not.toHaveAttribute('data-spotlight', /.*/)
  await step('calm panel 8 s later, still no ring')
}
