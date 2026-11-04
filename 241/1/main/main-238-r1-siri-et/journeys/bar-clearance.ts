import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// main's before for the wide-screen rule: the top bar's bottom against the Overview sheet and a vehicle panel's heading.
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  const banner = page.getByRole('banner')
  await expect(banner.getByText(/^Updated /)).toBeVisible()
  await page.waitForTimeout(3000)
  const s = await (await page.request.get('/api/snapshot')).json()
  const top = s.trips.filter((t: any) => !t.cancelled && typeof t.delay === 'number' && t.state === 'estimated').sort((a: any, b: any) => b.delay - a.delay)[0]
  const bb = (await banner.boundingBox())!
  const ov = await page.getByRole('dialog', { name: 'Overview' }).boundingBox()
  await step('bar and overview')
  await page.goto('/en?trip=' + top.key)
  const d = page.getByRole('dialog', { name: / to / })
  await expect(d).toBeVisible()
  await page.waitForTimeout(1500)
  const hb = (await d.getByRole('heading').first().boundingBox())!
  const bb2 = (await banner.boundingBox())!
  console.log('CLEAR ' + JSON.stringify({ bannerBottom: bb.y + bb.height, overviewTop: ov?.y, headingTop: hb.y, bannerBottom2: bb2.y + bb2.height }))
  await step('panel open')
  if (hb.y < bb2.y + bb2.height) throw new Error('bar covers heading')
}
