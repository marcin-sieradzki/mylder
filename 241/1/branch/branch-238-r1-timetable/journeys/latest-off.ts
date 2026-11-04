import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  const s = await (await page.request.get('/api/snapshot')).json()
  if (s.updates?.kind !== 'off' || s.source?.kind !== 'timetable') throw new Error('precondition: not the timetable source with delays off: ' + JSON.stringify({ u: s.updates, src: s.source }))
  await page.goto('/en')
  const banner = page.getByRole('banner')
  await expect(banner.getByText(/^Updated /)).toBeVisible()
  await expect(page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: /^Bus/ })).toBeVisible()
  await page.waitForTimeout(10000)
  await step('top bar on the timetable source')
  await expect(banner.getByText(/Latest now|Delays from Rejseplanen|—/)).toHaveCount(0)
  await expect(banner.getByRole('button', { name: /^Biggest delay/ })).toHaveCount(0)
  await page.goto('/da')
  await expect(banner.getByText(/^Opdateret /)).toBeVisible()
  await page.waitForTimeout(5000)
  await expect(banner.getByText(/Mest forsinket nu|Forsinkelser fra Rejseplanen|—/)).toHaveCount(0)
  await step('no pill in Danish either')
}
