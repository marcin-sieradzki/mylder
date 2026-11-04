import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { top, pillOf, spot, mapParam } from './lib.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/en')
  const pill = pillOf(page)
  await expect(pill).toBeVisible({ timeout: 60000 })
  await page.waitForTimeout(2000)
  const t = await top(page)
  const s = await (await page.request.get('/api/snapshot')).json()
  const trip = s.trips.find((x: any) => x.key === t!.key)
  console.log('snapshot', new Date(s.fetched).toISOString(), JSON.stringify({ key: trip.key, position: trip.position, progress: trip.progress, delay: trip.delay, waiting: trip.waiting }))
  await step('before')
  await pill.click()
  const t0 = Date.now()
  for (let i = 0; i < 40; i++) {
    const sp = await spot(page)
    console.log(Date.now() - t0, 'ms', sp.key?.slice(0, 8), sp.at, mapParam(page), await page.getByRole('banner').getByText(/^Updated /).textContent())
    if (i === 6 || i === 20 || i === 39) await step('t' + i)
    await page.waitForTimeout(250)
  }
}
