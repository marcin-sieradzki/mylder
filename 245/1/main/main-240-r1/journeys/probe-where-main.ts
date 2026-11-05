import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { snapshot, ranking, clockS } from './p.ts'
/** Main's vehicle panel: its where-line against its Next stop, over 80 s. */
export default async ({ page, step, expect }: Journey) => {
  const key = ranking(await snapshot(page))[0].key
  await page.goto('/en?trip=' + encodeURIComponent(key))
  const vp = page.getByRole('dialog').filter({ hasText: 'Next stop' }).first()
  await expect(vp).not.toContainText(/Next stop\s*—/, { timeout: 30000 })
  let seen = false
  for (let i = 0; i < 16; i++) {
    const t = (await vp.innerText()).split('\n').map((l) => l.trim())
    const next = t[t.indexOf('Next stop') + 1]
    const where = t.find((l) => /^(Between|At |Waiting at)/.test(l))
    const bad = where && /^Between/.test(where) && !where.endsWith(` and ${next}`)
    console.log(clockS(Date.now()), key, '| next', next, '| where', where, bad ? 'MISMATCH' : '')
    if (bad && !seen) { seen = true; await step('where vs next stop') }
    await page.waitForTimeout(5000)
  }
}
