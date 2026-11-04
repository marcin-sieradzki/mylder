import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
const da = 'da' === 'da'
export default async ({ page, step, expect }: Journey) => {
  const s = await (await page.request.get('/api/snapshot')).json()
  const known = s.trips.filter((t: any) => !t.cancelled && typeof t.delay === 'number' && ['live', 'ageing', 'estimated'].includes(t.state))
  if (known.length) throw new Error('precondition: ' + known.length + ' trips with a known delay')
  await page.goto(da ? '/da' : '/en')
  await expect(page.getByRole('banner').getByText(da ? /^Opdateret / : /^Updated /)).toBeVisible()
  await step('map opened')
  const banner = page.getByRole('banner')
  await expect(banner.getByRole('button', { name: da ? /^Største forsinkelse/ : /^Biggest delay/ })).toHaveCount(0, { timeout: 15000 })
  const pill = banner.getByText(da ? /Mest forsinket nu/ : /Latest now/).first()
  await expect(pill).toBeVisible({ timeout: 90000 })
  const aria = await banner.ariaSnapshot()
  console.log('NONE ' + JSON.stringify({ text: await pill.locator('xpath=..').innerText(), aria }))
  const shown = await pill.locator('xpath=..').innerText(); if (!/^(Latest now|Mest forsinket nu) —/.test(shown)) throw new Error('the pill does not read "Latest now —": ' + JSON.stringify(shown))
  if (!(da ? /Metro/ : /Metro sends no delays/).test(aria)) throw new Error('no word on the Metro: ' + aria)
  await step('pill shows none')
}
