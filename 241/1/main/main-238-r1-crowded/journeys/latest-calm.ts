import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
const da = 'en' === 'da'
export default async ({ page, step, expect }: Journey) => {
  const s = await (await page.request.get('/api/snapshot')).json()
  const known = s.trips.filter((t: any) => !t.cancelled && typeof t.delay === 'number' && ['live', 'ageing', 'estimated'].includes(t.state))
  const max = Math.max(...known.map((t: any) => t.delay))
  if (!known.length || Math.round(max / 60) >= 3) throw new Error('precondition: not a calm minute, ' + known.length + ' known, max ' + max)
  await page.goto(da ? '/da' : '/en')
  await expect(page.getByRole('banner').getByText(da ? /^Opdateret / : /^Updated /)).toBeVisible()
  await step('map opened')
  const banner = page.getByRole('banner')
  await expect(banner.getByRole('button', { name: da ? /^Største forsinkelse/ : /^Biggest delay/ })).toHaveCount(0, { timeout: 15000 })
  const calm = banner.getByText(da ? /Mest forsinket nu/ : /Latest now/).first()
  await expect(calm).toBeVisible({ timeout: 30000 })
  const holder = banner.locator(':scope *', { has: calm }).last()
  const t = (await calm.locator('xpath=..').innerText()).replace(/\s+/g, ' ')
  console.log('CALM ' + JSON.stringify({ text: t, max, known: known.length, aria: await banner.ariaSnapshot() }))
  if (!(da ? /\+?\d+ min.*(højst|mest)/ : /\+?\d+ min at most/).test(t)) throw new Error('calm pill reads "' + t + '"')
  await step('pill is calm')
}
