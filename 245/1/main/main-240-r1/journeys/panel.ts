import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { esc, mapEl, spot, box, mapParam } from './lib.ts'
import { W, type Lang, clock, snapshot, known, ranking, route, mins, headerBottom, noticeBoxes, spills, startSampler, ringClear, waitStandout, dims } from './p.ts'

/** Press the pill: the Latest right now panel, its head on the top trip, the next four, the source line,
 * nothing spilling, the ring clear at rest; then a tap on a list row: its vehicle panel, the ring moved and clear. */
export async function panelJourney({ page, step, expect }: Journey, o: { width?: number; lang: Lang; phone?: boolean; row?: number }) {
  const w = W[o.lang]
  const phone = !!o.phone
  await dims(page, o.width)
  await page.goto('/' + o.lang)
  const pill = await waitStandout(page, expect, o.lang)
  if (!phone) await expect(page.getByRole('dialog', { name: w.overview })).toBeVisible()
  await step('before press')
  const before = ranking(await snapshot(page))
  const map0 = mapParam(page)
  await startSampler(page)
  await pill.click()
  const after = ranking(await snapshot(page))
  await step('pressed')
  const url = new URL(page.url())
  console.log('address', url.search)
  expect(url.searchParams.get('latest'), '?latest=now').toBe('now')
  expect(url.searchParams.get('trip'), 'no trip=').toBeNull()
  const panel = page.getByRole('dialog', { name: w.title })
  await expect(panel).toBeVisible()
  const pb = await box(page, panel)
  const hb = await headerBottom(page, false)
  const vp = page.viewportSize()!
  const nb = await noticeBoxes(page)
  console.log('notices', JSON.stringify(nb))
  for (const n of nb) if (pb.left < n.right && pb.right > n.left && pb.top < n.bottom && pb.bottom > n.top) console.log(`NOTE: the notice "${n.text}" covers the panel's top`)
  console.log('panel box', JSON.stringify(pb), 'header bottom', hb, 'vp', JSON.stringify(vp))
  const title = await box(page, panel.getByRole('heading', { name: w.title }))
  expect(title.top, 'panel heading below the header').toBeGreaterThanOrEqual(hb - 0.5)
  if (!phone) expect(pb.top, 'desktop panel starts below the header').toBeGreaterThanOrEqual(hb - 0.5)
  else { expect(pb.top, 'phone panel peeks up from the foot').toBeLessThan(vp.height - 100); expect(pb.bottom, 'phone panel stands on the foot').toBeGreaterThanOrEqual(vp.height - 2) }

  // The head
  const picked = await mapEl(page).getAttribute('data-spotlight')
  expect(picked, 'a ring on the picked trip').toBeTruthy()
  expect([before[0]?.key, after[0]?.key], 'picked is the top at the press').toContain(picked)
  const card = panel.getByRole('region', { name: w.card })
  await expect(card).toBeVisible()
  let t: any, r: any
  await expect(async () => {
    const s = await snapshot(page)
    t = s.trips.find((x: any) => x.key === picked)
    r = await route(page, picked!)
    await expect(card.getByRole('heading', { name: `${w.to} ${t.headsign}` })).toBeVisible({ timeout: 1000 })
    await expect(card.getByText(t.line, { exact: true }).first()).toBeVisible({ timeout: 1000 })
    await expect(card.locator('.pn-Delay')).toContainText(`+${mins(t.delay)} min`, { timeout: 1000 })
  }).toPass({ timeout: 20000 })
  const text = await card.innerText()
  console.log('card text:', JSON.stringify(text))
  console.log('trip', JSON.stringify({ key: t.key, line: t.line, headsign: t.headsign, mode: t.mode, delay: t.delay, state: t.state, updated: t.updated, next: t.next[0] }))
  // mode · operator
  const modeWord = { en: { bus: 'Bus', 's-tog': 'S-tog', train: 'Train', metro: 'Metro', 'light-rail': 'Light rail' }, da: { bus: 'Bus', 's-tog': 'S-tog', train: 'Tog', metro: 'Metro', 'light-rail': 'Letbane' } }[o.lang] as any
  expect(text, 'mode · operator').toMatch(new RegExp(`(^|\\n)${esc(modeWord[t.mode])} · \\S.*`))
  // where it is
  const pillName = (await pill.getAttribute('aria-label')) ?? ''
  const lines = text.split('\n').map((l) => l.trim())
  const where = lines.find((l) => w.between.test(l) || w.at.test(l))
  expect(where, 'Between/At line').toBeTruthy()
  console.log('where', where, '| pill', pillName)
  // next stop
  const dd = card.locator('dt', { hasText: w.nextStop }).locator('xpath=following-sibling::dd[1]')
  const ddText = (await dd.innerText()).replace(/\s+/g, ' ')
  const struck = (await dd.locator('s').textContent())?.trim()
  const call = r.calls.find((c: any) => c.index === t.next[0].index)
  const planned = call.departure ?? call.arrival
  const expected = call.expectedDeparture ?? call.expectedArrival
  console.log('next stop dd:', ddText, '| struck', struck, '| route call', call.name, clock(planned), clock(expected))
  expect(ddText.startsWith(call.name), 'next stop name').toBe(true)
  expect(struck, 'struck = timetabled').toBe(clock(planned))
  expect(ddText, '~expected').toContain(`~${clock(expected)}`)
  const heard = await dd.evaluate((e) => (e as HTMLElement).innerText + ' || ' + e.textContent)
  const ariaHeard = await page.locator('body').ariaSnapshot()
  expect(ariaHeard, 'heard timetabled/expected').toMatch(w.heard)
  console.log('heard', heard)
  // data state
  const stateLabel = await card.locator('.pn-VehicleDotLabel').innerText()
  console.log('state label', stateLabel)
  if (t.state === 'estimated') expect(stateLabel.trim()).toBe(w.estimated)
  // delay sent
  const sent = lines.find((l) => w.sent.test(l))
  expect(sent, 'Delay sent line').toBeTruthy()
  expect(sent!.match(w.sent)![1], 'sent = updated').toBe(clock(t.updated))

  // the source line
  let src = ''
  await expect(async () => {
    const s = await snapshot(page)
    src = (await panel.locator('.pn-SourceLine').innerText()).trim()
    const m = src.match(w.source)
    expect(m, `source line "${src}"`).toBeTruthy()
    const n = Number(m![1].replace(/\D/g, ''))
    expect(n, 'count = trips with known delays').toBe(known(s).length)
  }).toPass({ timeout: 20000 })
  console.log('source', src)

  // the next four
  const list = panel.getByRole('region', { name: w.next })
  const rows = list.getByRole('button')
  let names: string[] = []
  await expect(async () => {
    const s = await snapshot(page)
    const rk = ranking(s).filter((x: any) => x.key !== picked).slice(0, 4)
    names = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || (e as HTMLElement).innerText))
    const want: string[] = []
    for (const x of rk) {
      const rr = await route(page, x.key)
      const c = rr.calls.find((c: any) => c.index === x.next[0].index)
      want.push(`${x.line} ${w.to} ${x.headsign}, ${mins(x.delay)} ${w.late}, ${w.ns} ${c.name}`)
    }
    await expect(rows).toHaveCount(4, { timeout: 1000 })
    for (let i = 0; i < 4; i++) await expect(rows.nth(i)).toHaveAccessibleName(want[i], { timeout: 1000 })
  }).toPass({ timeout: 30000 })
  for (let i = 0; i < 4; i++) {
    const rt = (await rows.nth(i).locator('xpath=ancestor-or-self::li[1]').innerText().catch(() => rows.nth(i).innerText())).replace(/\s+/g, ' ')
    console.log('row', i, rt)
    expect(rt, 'row shows Next stop: ').toContain(w.rowNext)
    expect(rt).toMatch(/\+\d+ min/)
  }
  // ring at rest
  await ringClear(page, expect, panel, o.lang, phone, 'pill', map0)
  await step('ring at rest')
  // nothing spills
  const bad = await spills(panel)
  console.log('spills', JSON.stringify(bad))
  await step('panel head and list')
  expect(bad, 'nothing in the panel spills or is cut').toEqual([])
  if (phone) {
    const h = await box(page, panel.getByRole('heading', { name: w.title }))
    await page.mouse.move((h.left + h.right) / 2, (h.top + h.bottom) / 2)
    await page.mouse.down()
    await page.mouse.move((h.left + h.right) / 2, 150, { steps: 12 })
    await page.mouse.up()
    await page.waitForTimeout(800)
    console.log('panel box after drag up', JSON.stringify(await box(page, panel)))
    await step('sheet dragged up')
    const bad2 = await spills(panel)
    console.log('spills raised', JSON.stringify(bad2))
    expect(bad2, 'nothing spills in the raised sheet').toEqual([])
  }
  {
    // the panel may hold more: scroll it to its foot and check again
    await panel.evaluate((d) => { for (const el of [d, ...d.querySelectorAll<HTMLElement>('*')]) if (el.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(el).overflowY)) el.scrollTop = el.scrollHeight })
    await page.waitForTimeout(400)
    await step('panel scrolled to its foot')
    const src2 = await box(page, panel.locator('.pn-SourceLine'))
    console.log('source line box after scroll', JSON.stringify(src2))
    expect(src2.bottom, 'source line reachable on the screen').toBeLessThanOrEqual(vp.height + 1)
  }


  // tap a row
  const ri = o.row ?? 0
  const rowName = (await rows.nth(ri).getAttribute('aria-label')) ?? (await rows.nth(ri).innerText())
  console.log('tapping row', ri, rowName)
  await rows.nth(ri).scrollIntoViewIfNeeded()
  const map1 = mapParam(page)
  await startSampler(page)
  await rows.nth(ri).click()
  await step('row tapped')
  const key = new URL(page.url()).searchParams.get('trip')
  expect(key, '?trip= of the row').toBeTruthy()
  expect(new URL(page.url()).searchParams.get('latest'), 'no latest=').toBeNull()
  const rt = (await snapshot(page)).trips.find((x: any) => x.key === key)
  expect(rowName.startsWith(`${rt.line} ${w.to} ${rt.headsign},`), 'row trip = opened trip').toBe(true)
  const vpanel = page.getByRole('dialog', { name: new RegExp(`${w.to} ${esc(rt.headsign)}`) })
  await expect(vpanel).toBeVisible()
  await expect(panel).toBeHidden()
  await expect(mapEl(page)).toHaveAttribute('data-spotlight', key!)
  await ringClear(page, expect, vpanel, o.lang, phone, 'row', map1)
  await step('ring moved, at rest')
  const vbad = await spills(vpanel)
  console.log('vehicle panel spills', JSON.stringify(vbad))
  // hover the ring (desktop)
  if (!phone) {
    await page.mouse.move(5, vp.height / 2)
    await expect(async () => {
      const s3 = await spot(page)
      const [x3, y3] = s3.at!.split(' ').map(Number)
      await page.mouse.move(x3, y3)
      await expect(page.getByRole('tooltip')).toContainText(`${rt.line} ${w.to} ${rt.headsign}`, { timeout: 1500 })
    }).toPass({ timeout: 15000 })
    await step('hover on moved ring')
    await page.mouse.move(5, vp.height / 2)
  }
  await vpanel.getByRole('button', { name: w.close }).click()
  await expect(vpanel).toBeHidden()
  await expect(mapEl(page)).not.toHaveAttribute('data-spotlight', /.*/)
  await step('closed')
}
