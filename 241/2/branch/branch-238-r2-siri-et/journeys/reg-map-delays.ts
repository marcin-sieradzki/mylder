import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect(async () => {
    const s = await (await page.request.get('/api/snapshot')).json()
    if (s.updates.kind !== 'recording' || !s.updates.fresh) throw new Error('updates ' + JSON.stringify(s.updates))
    const bad = s.trips.filter((t: any) => !['estimated', 'timetable-only'].includes(t.state) || (t.mode === 'metro' && t.state !== 'timetable-only'))
    if (bad.length) throw new Error('unexpected states ' + bad.length)
    const n = s.trips.filter((t: any) => !t.cancelled).length
    await expect(page.locator('[data-vehicles]')).toHaveAttribute('data-vehicles', String(n), { timeout: 3000 })
  }).toPass({ timeout: 60000 })
  await expect(page.getByRole('status').filter({ hasText: /Recorded data from|paused/i })).toHaveCount(0)
  await expect(page.getByText(/live positions aren't connected yet/)).toHaveCount(0)
  await step('map with delays')
}
