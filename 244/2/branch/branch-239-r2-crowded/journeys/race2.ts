import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { top, pillOf, spot, mapParam, waitLanded, headerBottom, box, ringAt } from './lib.ts'

/** Round 2's race: press the pill the moment the page asks for the minute's snapshot, from a camera far
 * from the trip, so the new snapshot lands while the camera is in the air. Once the camera rests (and the
 * new snapshot has landed), the ring must lie below the header (bar, the pill's row and every page notice),
 * clear of the open panel and, on a desktop, the Overview sheet; on a phone above the panel's peek.
 * Env: WIDTH (desktop px; unset with --phone), RACED (tries whose snapshot landed in flight, default 3),
 * MAXTRIES (default RACED + 2). */
export default async ({ page, step, expect }: Journey) => {
  const width = process.env.WIDTH ? Number(process.env.WIDTH) : undefined
  const phone = !width
  if (width) await page.setViewportSize({ width, height: 800 })
  const want = Number(process.env.RACED ?? 3)
  const maxTries = Number(process.env.MAXTRIES ?? want + 2)
  const results: { line: string; ok: boolean; raced: boolean }[] = []
  for (let i = 1; i <= maxTries && results.filter((r) => r.raced).length < want; i++) {
    // start each try far from the trip: the city centre, zoom 11
    await page.goto('/en?map=11.00/55.67600/12.56800')
    const pill = pillOf(page)
    await expect(pill).toBeVisible({ timeout: 60000 })
    const updated = page.getByRole('banner').getByText(/^Updated /)
    await expect(updated).toBeVisible()
    await page.waitForTimeout(3000)
    const before = await top(page)
    const u0 = await updated.textContent()
    // the page's next ask for the snapshot (not the load's)
    const req = await page.waitForRequest((r) => r.url().includes('/api/snapshot'), { timeout: 80000 })
    const respP = req.response()
    await pill.click()
    const tPress = Date.now()
    const key = new URL(page.url()).searchParams.get('trip')
    const trace: string[] = []
    let respAt = -1
    void respP.then(() => { respAt = Date.now() - tPress })
    let n = 0
    let lastLine = ''
    let firstRest = ''
    while (Date.now() - tPress < 9000) {
      const s = await spot(page)
      const m = mapParam(page)
      const u = await updated.textContent()
      const l = `${s.at} map=${m} ${u}`
      if (l !== lastLine) { trace.push(`+${Date.now() - tPress}ms ${l}`); lastLine = l }
      if (n === 6) await step(`try ${i} in the air`)
      n++
      await page.waitForTimeout(100)
    }
    const u1 = await updated.textContent()
    const raced = u1 !== u0 && respAt >= 0 && respAt < 4000
    await waitLanded(page)
    await page.waitForTimeout(1500)
    const landed = mapParam(page)
    const s = await spot(page)
    if (!s.at) throw new Error(`try ${i}: no data-spotlight-at once landed (spotlight ${s.key})`)
    const [x, y] = s.at.split(' ').map(Number)
    const vp = page.viewportSize()!
    const hb = await headerBottom(page)
    const notices = await page.locator('[role=status]').evaluateAll((els) => els.filter((e) => !e.closest('[role=dialog]') && (e as HTMLElement).offsetParent !== null).map((e) => { const r = e.getBoundingClientRect(); return { text: (e as HTMLElement).innerText.slice(0, 50), left: r.left, top: r.top, right: r.right, bottom: r.bottom } }).filter((r) => r.right > r.left && r.bottom > r.top))
    const topNotices = notices.filter((nn) => nn.top < vp.height / 2)
    const ceiling = Math.max(hb, ...topNotices.map((nn) => nn.bottom))
    const tripPanel = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: 'Follow' }) })
    const pb = await box(page, tripPanel)
    const overlapsNotice = notices.some((nn) => x + 12 > nn.left && x - 12 < nn.right && y + 12 > nn.top && y - 12 < nn.bottom)
    let ok: boolean
    let geom: string
    let clearRect: { left: number; top: number; right: number; bottom: number }
    if (!phone) {
      const ob = await box(page, page.getByRole('dialog', { name: 'Overview' }))
      ok = y - 12 > ceiling && x - 12 > ob.right && x + 12 < pb.left && y + 12 < vp.height && !overlapsNotice
      geom = `ring ${x},${y}; header ${Math.round(hb)}; notices ${JSON.stringify(topNotices.map((nn) => [nn.text, Math.round(nn.left), Math.round(nn.bottom), Math.round(nn.right)]))}; sheet right ${Math.round(ob.right)}; panel left ${Math.round(pb.left)}`
      clearRect = { left: ob.right, top: ceiling, right: pb.left, bottom: vp.height }
    } else {
      ok = y - 12 > ceiling && y + 12 < pb.top && x - 12 > 0 && x + 12 < vp.width && !overlapsNotice
      geom = `ring ${x},${y}; header ${Math.round(hb)}; notices ${JSON.stringify(topNotices.map((nn) => [nn.text, Math.round(nn.left), Math.round(nn.bottom), Math.round(nn.right)]))}; panel top ${Math.round(pb.top)}; vp ${vp.width}x${vp.height}`
      clearRect = { left: 0, top: ceiling, right: vp.width, bottom: pb.top }
    }
    const r = await ringAt(page, x, y, clearRect)
    ok = ok && r.sectors >= 14
    const line = `try ${i}: ${u0} -> ${u1}; snapshot answered +${respAt}ms after the press${raced ? ' (in flight)' : ' (NOT a race: no new snapshot in flight)'}; top before ${before?.key}@${before?.mins}; pill trip ${key}; spotlight ${s.key}; landed map=${landed}; ${geom}; ring pixels ${r.sectors}/16 sectors, ${r.elsewhere} red px elsewhere; ${ok ? 'CLEAR' : 'NOT CLEAR'}`
    console.log(line)
    console.log(trace.map((t) => `  ${t}`).join('\n'))
    results.push({ line, ok, raced })
    await step(`try ${i} rested ${ok ? 'clear' : 'NOT clear'}${raced ? '' : ' (no race)'}`)
    expect(s.key, 'the ring is on the trip in ?trip=').toBe(key)
    await tripPanel.getByRole('button', { name: 'Close' }).click()
    await page.waitForTimeout(500)
  }
  console.log('SUMMARY\n' + results.map((r) => r.line).join('\n'))
  const raced = results.filter((r) => r.raced)
  expect(raced.length, `${want} presses with the snapshot landing in flight`).toBeGreaterThanOrEqual(want)
  expect(results.filter((r) => !r.ok).map((r) => r.line), 'every landing clear').toEqual([])
}
