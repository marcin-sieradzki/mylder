import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const rank = async (page: any) => {
  const snap = await (await page.request.get('/api/snapshot')).json()
  const known = snap.trips.filter((t: any) => !t.cancelled && typeof t.delay === 'number' && ['live', 'ageing', 'estimated'].includes(t.state))
  known.sort((a: any, b: any) => b.delay - a.delay || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  const cancelledBigger = snap.trips.filter((t: any) => t.cancelled && typeof t.delay === 'number' && known[0] && t.delay > known[0].delay)
  return { snap, top: known[0], known, cancelledBigger }
}
const nameOf = async (loc: any) => {
  const y: string = await loc.ariaSnapshot()
  const m = y.match(/button "((?:[^"\\]|\\.)*)"/)
  return m ? m[1] : y
}

export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  await step('map opened')
  const pill = page.getByRole('banner').getByRole('button', { name: /^Biggest delay right now: / })
  await expect(pill).toBeVisible({ timeout: 30000 })
  let top: any
  await expect(async () => {
    top = (await rank(page)).top
    const name = await nameOf(pill)
    if (!name.startsWith('Biggest delay right now: ' + top.line + ' to ' + top.headsign + ',')) throw new Error('pill "' + name + '" is not ' + top.key)
  }).toPass({ timeout: 60000 })
  await step('pill before press')
  await pill.click()
  const dialog = page.getByRole('dialog', { name: new RegExp('to ' + esc(top.headsign)) })
  await expect(dialog).toBeVisible()
  await expect(page).toHaveURL(new RegExp('[?&]trip=' + esc(encodeURIComponent(top.key)).replace(/%/g, '%')))
  await expect(dialog.getByText(top.line, { exact: true }).first()).toBeVisible()
  console.log('OPENED ' + top.key + ' ' + page.url())
  await step('vehicle panel of the named trip')
}
