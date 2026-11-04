import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// moving-map: draw with SIRI-ET, no banner, filter, tilt and turn by keys, centre
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  const map = page.locator('[data-vehicles]')
  await expect(async () => {
    const s = await (await page.request.get('/api/snapshot')).json()
    expect(s.updates.fresh).toBe(true)
    const n = s.trips.filter((t: any) => !t.cancelled).length
    expect(await map.getAttribute('data-vehicles')).toBe(String(n))
  }).toPass({ timeout: 70000 })
  await expect(page.getByRole('status').filter({ hasText: /^Recorded data/ })).toHaveCount(0)
  await step('drawn')
  const before = Number(await map.getAttribute('data-vehicles'))
  const busChip = page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: /^Bus/ })
  const count = Number((await busChip.innerText()).replace(/\D/g, ''))
  await busChip.click()
  await expect(async () => expect(Number(await map.getAttribute('data-vehicles'))).toBeLessThanOrEqual(before - count)).toPass({ timeout: 10000 })
  await step('buses off')
  await busChip.click()
  await expect(async () => expect(Math.abs(Number(await map.getAttribute('data-vehicles')) - before)).toBeLessThan(15)).toPass({ timeout: 10000 })
  await page.getByRole('region', { name: 'Live map of Copenhagen' }).focus()
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowUp')
  for (let i = 0; i < 2; i++) await page.keyboard.press('Shift+ArrowRight')
  await expect(map).toHaveAttribute('data-tilt', '30', { timeout: 10000 })
  await expect(map).toHaveAttribute('data-heading', '30', { timeout: 10000 })
  await step('tilted and turned')
  await page.getByRole('button', { name: 'Centre the map' }).click()
  await expect(map).toHaveAttribute('data-tilt', '0', { timeout: 10000 })
  await expect(map).toHaveAttribute('data-heading', '0', { timeout: 10000 })
  await step('centred')
}
