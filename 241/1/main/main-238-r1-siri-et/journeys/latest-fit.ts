import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// The pill's words stay inside the pill and the screen, and the top bar leaves the panels' headings clear.
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  const banner = page.getByRole('banner')
  const pill = banner.getByRole('button', { name: /^Biggest delay right now: / })
  await expect(pill).toBeVisible({ timeout: 60000 })
  await page.waitForTimeout(1500)
  await step('pill')
  const vw = page.viewportSize()!.width
  const m = await pill.evaluate((el) => {
    const r = document.createRange(); r.selectNodeContents(el)
    const t = r.getBoundingClientRect(), b = el.getBoundingClientRect()
    return { text: { left: t.left, right: t.right }, pill: { left: b.left, right: b.right }, scrollW: el.scrollWidth, clientW: el.clientWidth, words: (el as HTMLElement).innerText }
  })
  const bannerBox = (await banner.boundingBox())!
  const overview = page.getByRole('dialog', { name: 'Overview' })
  const ovBox = await overview.boundingBox()
  console.log('FIT ' + JSON.stringify({ vw, m, bannerBottom: bannerBox.y + bannerBox.height, overviewTop: ovBox?.y }))
  const problems: string[] = []
  if (m.text.left < -0.5 || m.text.right > vw + 0.5) problems.push('pill words run off the screen: ' + JSON.stringify(m.text) + ' in a ' + vw + ' px viewport')
  if (m.text.left < m.pill.left - 0.5 || m.text.right > m.pill.right + 0.5) problems.push('pill words spill outside the pill: words ' + JSON.stringify(m.text) + ', pill ' + JSON.stringify(m.pill))
  await pill.click()
  const dialog = page.getByRole('dialog', { name: / to / })
  await expect(dialog).toBeVisible()
  await page.waitForTimeout(1500)
  await step('panel open')
  const h = dialog.getByRole('heading').first()
  const hb = (await h.boundingBox())!
  const bb = (await banner.boundingBox())!
  console.log('HEAD ' + JSON.stringify({ heading: hb, bannerBottom: bb.y + bb.height, headingText: await h.innerText() }))
  if (vw >= 600 && hb.y < bb.y + bb.height - 0.5) problems.push('the top bar covers the panel heading: heading top ' + hb.y + ', bar bottom ' + (bb.y + bb.height))
  if (problems.length) throw new Error(problems.join('; '))
}
