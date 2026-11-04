import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await step('map opened')
  const banner = page.getByRole('banner')
  const pill = banner.getByRole('button', { name: /^Biggest delay right now: / })
  await expect(pill).toBeVisible({ timeout: 60000 })
  const about = page.getByRole('button', { name: 'About Mylder' })
  await expect(about).toBeVisible()
  await step('pill and the top bar')
  const p = (await pill.boundingBox())!, a = (await about.boundingBox())!
  const vw = page.viewportSize()!.width
  const phone = vw < 600
  console.log('PLACE ' + JSON.stringify({ vw, pill: p, about: a }))
  if (p.x < 0 || p.x + p.width > vw + 0.5) throw new Error('pill runs outside the viewport: ' + JSON.stringify(p))
  if (phone) {
    if (p.y < a.y + a.height - 0.5) throw new Error('on a phone the pill is not below the first row: pill top ' + p.y + ', About bottom ' + (a.y + a.height))
  } else {
    const overlap = Math.min(p.y + p.height, a.y + a.height) - Math.max(p.y, a.y)
    if (overlap <= 0) throw new Error('on a wide screen the pill is not in the bar row with About: ' + JSON.stringify({ p, a }))
  }
  const sw = await page.evaluate(() => document.documentElement.scrollWidth)
  if (sw > vw) throw new Error('page scrolls sideways: ' + sw + ' > ' + vw)
}
