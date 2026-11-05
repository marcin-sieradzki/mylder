import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { snapshot, ranking, route, clockS } from './p.ts'
/** Compare the card's where-line with its Next stop, the pill's name, and the trip's vehicle panel, over a minute. */
export default async ({ page, step, expect }: Journey) => {
  const v = await page.context().newPage()
  await page.goto('/en?latest=now')
  const card = page.getByRole('region', { name: 'The latest trip' })
  await expect(card).toBeVisible({ timeout: 90000 })
  const key = await page.locator('[data-vehicles]').getAttribute('data-spotlight')
  await v.goto('/en?trip=' + encodeURIComponent(key!))
  const vp = v.getByRole('dialog').filter({ hasText: 'Next stop' }).first()
  await expect(vp).toBeVisible({ timeout: 30000 })
  for (let i = 0; i < 8; i++) {
    const s = await snapshot(page)
    const t = s.trips.find((x: any) => x.key === key)
    const r = await route(page, key!)
    const lines = (await card.innerText()).split('\n').filter((l) => /^(Between|At|Waiting)/.test(l) || /^Next stop/.test(l))
    const dd = (await card.locator('dt', { hasText: 'Next stop' }).locator('xpath=following-sibling::dd[1]').innerText()).replace(/\s+/g, ' ')
    const pill = await page.getByRole('banner').getByRole('button', { name: /^Biggest delay/ }).getAttribute('aria-label').catch(() => '')
    const vtext = (await vp.innerText()).split('\n').filter((l) => /^(Between|At |Waiting|Next stop|Last seen|Where)/i.test(l) || /between|ved|at /i.test(l)).slice(0, 6)
    const vdd = (await vp.locator('dt', { hasText: 'Next stop' }).locator('xpath=following-sibling::dd[1]').innerText().catch(() => '?')).replace(/\s+/g, ' ')
    console.log(clockS(Date.now()), 'snap', clockS(s.fetched), 'next', r.calls.find((c: any) => c.index === t.next[0].index)?.name, '\n  card:', JSON.stringify(lines), '|', dd, '\n  pill:', pill, '\n  vehicle panel:', JSON.stringify(vtext), '|', vdd)
    if (i === 0) await step('card'); 
    await page.waitForTimeout(8000)
  }
  await step('card later')
  await v.screenshot({ path: '.verify/main-240-r1/probe-where/vehicle-panel.png' })
}
