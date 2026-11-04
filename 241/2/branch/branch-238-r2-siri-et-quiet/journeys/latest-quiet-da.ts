import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
const da = 'da' === 'da'
export default async ({ page, step, expect }: Journey) => {
  await expect.poll(async () => (await (await page.request.get('/api/snapshot')).json()).updates.fresh, { timeout: 480000, intervals: [10000] }).toBe(false)
  await page.goto(da ? '/da' : '/en')
  await step('map opened, feed quiet')
  const banner = page.getByRole('banner')
  await expect(banner.getByText(da ? 'Forsinkelser fra Rejseplanen ikke opdateret siden 09:56' : 'Delays from Rejseplanen not updated since 09:56')).toBeVisible({ timeout: 30000 })
  await expect(banner.getByRole('button', { name: da ? /^Største forsinkelse/ : /^Biggest delay/ })).toHaveCount(0)
  await expect(banner.getByText(/\+\d+ min/)).toHaveCount(0)
  await step('pill says the feed is quiet')
}
