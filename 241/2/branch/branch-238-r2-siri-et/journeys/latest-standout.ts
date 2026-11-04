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
const L = 'en' === 'da'
  ? { path: '/da', updated: /^Opdateret /, title: 'Største forsinkelse lige nu: ', to: 'mod', late: 'min forsinket', between: 'mellem', and: 'og', at: 'ved', latest: 'Mest forsinket nu' }
  : { path: '/en', updated: /^Updated /, title: 'Biggest delay right now: ', to: 'to', late: 'min late', between: 'between', and: 'and', at: 'at', latest: 'Latest now' }
export default async ({ page, step, expect }: Journey) => {
  await page.goto(L.path)
  await step('map opened')
  const pill = page.getByRole('banner').getByRole('button', { name: new RegExp('^' + esc(L.title)) })
  let seen: any = {}
  await expect(async () => {
    const { top, known, cancelledBigger } = await rank(page)
    if (!top) throw new Error('precondition: no trip with a known delay in /api/snapshot')
    const n = Math.round(top.delay / 60)
    if (n < 3) throw new Error('precondition: the minute is calm, largest delay ' + top.delay + ' s')
    const name = await nameOf(pill)
    const re = new RegExp('^' + esc(L.title) + esc(top.line) + ' ' + L.to + ' ' + esc(top.headsign) + ', ' + n + ' ' + L.late + ', (' + L.between + ' (.+) ' + L.and + ' (.+)|' + L.at + ' (.+))$')
    const m = name.match(re)
    if (!m) throw new Error('pill name "' + name + '" does not match ' + re + ' (top ' + top.key + ')')
    const stop = m[2] ?? m[4]
    const text = (await pill.innerText()).replace(/\s+/g, ' ').trim()
    for (const part of [L.latest, top.line, '+' + n + ' min', L.at + ' ' + stop])
      if (!text.includes(part)) throw new Error('pill text "' + text + '" lacks "' + part + '"')
    seen = { key: top.key, line: top.line, headsign: top.headsign, delay: top.delay, n, name, text, ranked: known.length, cancelledBigger: cancelledBigger.map((t: any) => t.key + ' ' + t.delay) }
  }).toPass({ timeout: 60000 })
  console.log('SEEN ' + JSON.stringify(seen))
  await step('pill names the latest trip')
  await expect(pill.locator('..')).toBeVisible()
}
