import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// main's before: the Planes notice against an open trip panel at 1000 and 1280 px.
export default async ({ page, step, expect }: Journey) => {
  const s = await (await page.request.get('/api/snapshot')).json()
  const t = s.trips.find((t: any) => t.mode === 'bus' && !t.cancelled)
  for (const w of [1000, 1280]) {
    await page.setViewportSize({ width: w, height: 800 })
    await page.goto('/en?trip=' + t.key)
    const d = page.getByRole('dialog', { name: / to / })
    await expect(d).toBeVisible()
    await page.waitForTimeout(3000)
    const n = page.getByText(/^Planes: recorded/)
    const nb = await n.boundingBox(); const db = (await d.boundingBox())!
    console.log('NOTICE ' + JSON.stringify({ w, notice: nb, panel: db }))
    await step(w + 'px trip panel and notice')
  }
}
