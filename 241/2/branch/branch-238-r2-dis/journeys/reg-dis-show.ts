import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// dis-list, dis-show and the highlight chip below the header (ruling 3), at 1000 px (pill on its row) and 1440 px.
export default async ({ page, step, expect }: Journey) => {
  const problems: string[] = []
  for (const w of [1000, 1440]) {
    await page.setViewportSize({ width: w, height: 800 })
    await page.goto('/en?tab=disruptions')
    const sheet = page.getByRole('dialog', { name: 'Overview' })
    await expect(sheet.getByRole('list', { name: 'Active now' })).toContainText('Færre S-tog mellem København H og Hellerup')
    await expect(sheet.getByRole('list', { name: 'Active now' })).toContainText('Linje 5C kører en anden rute ved Langebro')
    await expect(sheet.getByRole('list', { name: 'Later' })).toContainText('Ingen S-tog mellem Hellerup og Holte i weekenden')
    await expect(sheet.getByText('Messages from Rejseplanen, checked 07:20.')).toBeVisible()
    await expect(page.getByRole('banner').getByRole('button', { name: /^Biggest delay right now: / })).toBeVisible({ timeout: 30000 })
    await page.waitForTimeout(1500)
    await step(w + 'px disruptions')
    const card = sheet.getByRole('listitem').filter({ hasText: 'Linje 5C kører en anden rute ved Langebro' })
    await card.getByRole('button', { name: 'Show on map' }).click()
    const chip = page.getByRole('button', { name: /^Showing: .* · Clear$/ })
    await expect(chip).toBeVisible()
    await page.waitForTimeout(3000)
    const hb = (await page.getByRole('banner').boundingBox())!, cb = (await chip.boundingBox())!, sb = (await sheet.boundingBox())!
    console.log('DIS ' + JSON.stringify({ w, headerBottom: hb.y + hb.height, chipTop: cb.y, sheetTop: sb.y, url: page.url() }))
    if (cb.y < hb.y + hb.height - 0.5) problems.push(`${w}px: the highlight chip at ${cb.y} sits above the header's bottom ${hb.y + hb.height}`)
    if (sb.y < hb.y + hb.height - 0.5) problems.push(`${w}px: the sheet at ${sb.y} sits above the header's bottom`)
    await step(w + 'px show on map 5C')
    await chip.click()
    await expect(chip).toBeHidden()
    await step(w + 'px cleared')
  }
  await page.getByRole('navigation', { name: 'Language' }).getByRole('link', { name: 'Dansk' }).click()
  await expect(page).toHaveURL(/\/da/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'da')
  await expect(page.getByRole('dialog', { name: 'Overblik' })).toBeVisible()
  await expect(page.getByRole('banner').getByRole('button', { name: /^Største forsinkelse lige nu: / })).toBeVisible({ timeout: 30000 })
  await step('switched to Danish')
  if (problems.length) throw new Error(problems.join('\n'))
}
