import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { pillOf, spot, mapParam, top } from './lib.ts'
/** Trace the ring's point and the camera from a press made as the page asks for the minute's snapshot. */
export default async ({ page, step, expect }: Journey) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/en')
  const pill = pillOf(page)
  await expect(pill).toBeVisible({ timeout: 60000 })
  for (let i = 1; i <= 2; i++) {
    await page.waitForRequest((r) => r.url().includes('/api/snapshot'), { timeout: 75000 })
    const before = await top(page)
    await pill.click()
    const t0 = Date.now()
    let last = ''
    let n = 0
    while (Date.now() - t0 < 7000) {
      const s = await spot(page)
      const line = `${s.at} map=${mapParam(page)} ${await page.getByRole('banner').getByText(/^Updated /).textContent()}`
      if (line !== last) { console.log(`try ${i} +${Date.now() - t0}ms ${line}`); last = line }
      if (n === 10 || n === 40) await step(`try ${i} t${n}`)
      n++
      await page.waitForTimeout(80)
    }
    console.log('top before', before?.key, before?.mins, 'after', (await top(page))?.mins)
    await step(`try ${i} end`)
    await page.getByRole('dialog').filter({ has: page.getByRole('button', { name: 'Follow' }) }).getByRole('button', { name: 'Close' }).click()
  }
}
