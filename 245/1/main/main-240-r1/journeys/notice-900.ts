import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { noticeBoxes, headerBottom, waitStandout } from './p.ts'
/** At 900 px: where the page notice sits against the Overview sheet and the panel the pill opens. */
export default async ({ page, step, expect }: Journey) => {
  await page.setViewportSize({ width: Number(process.env.W ?? 900), height: 800 })
  await page.goto('/en')
  const pill = await waitStandout(page, expect, 'en')
  await step('before press')
  await pill.click()
  await page.waitForTimeout(3000)
  await step('pressed')
  const nb = await noticeBoxes(page)
  const dl = await page.getByRole('dialog').evaluateAll((ds) => ds.map((d) => { const r = d.getBoundingClientRect(); const h = d.querySelector('h2')?.getBoundingClientRect(); return { name: d.getAttribute('aria-label') ?? d.querySelector('h2')?.textContent, top: r.top, left: r.left, right: r.right, h2: h && { top: h.top, bottom: h.bottom, left: h.left, right: h.right } } }))
  console.log('url', page.url())
  console.log('notices', JSON.stringify(nb), 'header', await headerBottom(page, false))
  console.log('dialogs', JSON.stringify(dl))
  for (const d of dl) for (const n of nb) console.log(d.name, 'vs', n.text, d.left < n.right && d.right > n.left && d.top < n.bottom ? 'OVERLAP' : 'clear')
  const hit = await page.evaluate(() => [...document.querySelectorAll('[role=dialog] h2, [role=dialog] button[aria-label=Close], [role=dialog] [aria-label=Close]')].map((e) => { const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return `${e.textContent || e.getAttribute('aria-label')} @${Math.round(r.left)},${Math.round(r.top)} top element: ${t?.closest('[role=dialog]') === e.closest('[role=dialog]') ? 'itself' : (t as HTMLElement)?.innerText?.slice(0, 40)}` }))
  console.log('hit tests', JSON.stringify(hit, null, 1))
}
