import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  const s = await (await page.request.get('/api/snapshot')).json()
  const t = s.trips.find((t: any) => t.mode === 'bus' && t.state === 'estimated' && t.delay >= 120 && !t.cancelled)
  if (!t) throw new Error('precondition: no estimated bus 2 min late')
  await page.goto('/en?trip=' + t.key)
  const d = page.getByRole('dialog', { name: new RegExp('to ' + t.headsign.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })
  await expect(d).toBeVisible()
  await expect(d.getByText('Estimated', { exact: true })).toBeVisible()
  await expect(d.getByText(/^Estimated from the timetable and a delay of \+\d+ min$/)).toBeVisible()
  await expect(d).toContainText(/Timetable and Rejseplanen.s delays\s·\s*updated \d\d:\d\d:\d\d/)
  await expect(d.getByText(/placed|No live positions yet/)).toHaveCount(0)
  await step('delayed bus panel ' + t.key)
}
