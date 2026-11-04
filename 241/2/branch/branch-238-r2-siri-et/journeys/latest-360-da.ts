import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// Rulings (2) and (3): wherever the pill sits, its label, badge, delay and 10+ characters of the stop show; the bar
// keeps one row when the pill is in it, else the pill has a row of its own at the start under the bar, inside it;
// the Overview, the trip panel, the stop panel and the highlight chip start below the header (bar plus pill row).
const LANG = ('da') as 'en' | 'da'
const QUIET = process.env.QUIET === '1'
const L = LANG === 'da'
  ? { path: '/da', title: /^Største forsinkelse lige nu: /, latest: 'Mest forsinket nu', overview: 'Overblik', showLine: 'Vis hele linjen', showing: /^Viser: .* · Ryd$/, quiet: 'Forsinkelser fra Rejseplanen ikke opdateret siden 09:56' }
  : { path: '/en', title: /^Biggest delay right now: /, latest: 'Latest now', overview: 'Overview', showLine: 'Show whole line', showing: /^Showing: .* · Clear$/, quiet: 'Delays from Rejseplanen not updated since 09:56' }
const WIDTHS = (process.env.WIDTHS ?? '360,412,800,900,1000,1100,1280,1440,1920,1000,1440').split(',').map(Number)
export default async ({ page, step, expect }: Journey) => {
  const problems: string[] = []
  const rows: any[] = []
  await page.setViewportSize({ width: WIDTHS[0], height: 800 })
  await page.goto(L.path)
  const banner = page.getByRole('banner')
  await expect(banner.getByRole('group', { name: LANG === 'da' ? /Filtre|Filters/ : 'Filters' }).getByRole('button')).toHaveCount(6, { timeout: 60000 })
  const pill = QUIET ? banner.getByRole('button').filter({ hasText: L.quiet }) : banner.getByRole('button', { name: L.title })
  if (QUIET) await expect(banner.getByText(L.quiet)).toBeVisible({ timeout: 480000 })
  await expect(pill).toBeVisible({ timeout: 90000 })
  const quietIsButton = QUIET ? await pill.count() : 1
  const target = QUIET && !quietIsButton ? banner.getByText(L.quiet) : pill
  for (const [i, w] of WIDTHS.entries()) {
    await page.setViewportSize({ width: w, height: 800 })
    await page.waitForTimeout(1500)
    const m = await target.evaluate((el, QUIET) => {
      const r = (e: Element | null) => { if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height } }
      const pillEl = (el.closest('button') ?? el) as HTMLElement
      const header = pillEl.closest('header')!
      const bar = header.querySelector('.pn-TopBar')!
      const brand = bar.querySelector('.pn-TopBar-brand')
      const tools = bar.querySelector('.pn-TopBar-tools')
      const toolBtns = Array.from(tools?.querySelectorAll('a,button') ?? []).filter((b) => !b.contains(pillEl) && b !== pillEl)
      const about = toolBtns[toolBtns.length - 1] ?? null
      const content = pillEl.querySelector('.pn-Button-label > span') ?? pillEl
      const kids = Array.from(content.children)
      const label = kids[0] ?? null
      const badge = pillEl.querySelector('.pn-LineBadge'), delay = pillEl.querySelector('.pn-Delay')
      const where = QUIET ? null : kids[kids.length - 1]
      let vis = -1, name = '', truncated = false
      if (where) {
        const inner = where.querySelector('span') ?? where
        const tn = Array.from(inner.childNodes).find((n) => n.nodeType === 3 && (n.textContent ?? '').trim().length > 0) as Text | undefined
        name = tn?.textContent ?? ''
        const clips = [where, pillEl.querySelector('.pn-Button-label'), pillEl].filter(Boolean).map((e) => (e as Element).getBoundingClientRect().right)
        const clipRight = Math.min(...clips, window.innerWidth)
        const probe = document.createElement('span'); probe.textContent = '…'; probe.style.font = getComputedStyle(inner).font; probe.style.position = 'absolute'; inner.appendChild(probe)
        const ellW = probe.getBoundingClientRect().width; probe.remove()
        const range = document.createRange(); vis = 0
        if (tn) {
          range.selectNodeContents(tn); truncated = range.getBoundingClientRect().right > clipRight + 0.5
          for (let k = 0; k < name.length; k++) { range.setStart(tn, k); range.setEnd(tn, k + 1); const cr = range.getBoundingClientRect().right; if (cr <= clipRight - (truncated ? ellW : 0) + 0.5) vis = k + 1; else break }
        }
      }
      const rowEl = pillEl.parentElement!
      return { inBar: !!pillEl.closest('.pn-TopBar'), vw: window.innerWidth, header: r(header), bar: r(bar), brand: r(brand), about: r(about), aboutText: about?.textContent, tools: r(tools), pill: r(pillEl), row: r(rowEl),
        label: r(label), labelText: label?.textContent, badge: r(badge), badgeText: badge?.textContent, delay: r(delay), delayText: delay?.textContent, where: r(where), name, vis, truncated, scrollW: pillEl.scrollWidth, clientW: pillEl.clientWidth,
        docScroll: document.documentElement.scrollWidth }
    }, QUIET)
    const tag = `${LANG} ${w}px${i > 0 && WIDTHS.indexOf(w) < i ? ' (resized back)' : ''}`
    const P = (s: string) => problems.push(tag + ': ' + s)
    const inside = (a: any, b: any) => a && b && a.l >= b.l - 0.5 && a.r <= b.r + 0.5 && a.t >= b.t - 0.5 && a.b <= b.b + 0.5
    const vp = { l: 0, r: w, t: 0, b: 800 }
    if (!inside(m.pill, vp)) P('pill leaves the screen ' + JSON.stringify(m.pill))
    if (m.scrollW > m.clientW) P(`pill content overflows (${m.scrollW} > ${m.clientW})`)
    if (m.docScroll > w) P('page scrolls sideways ' + m.docScroll)
    if (!QUIET) {
      if (m.labelText !== L.latest) P('label reads ' + JSON.stringify(m.labelText))
      for (const k of ['label', 'badge', 'delay'] as const) {
        if (!inside((m as any)[k], m.pill)) P(k + ' not inside the pill ' + JSON.stringify((m as any)[k]) + ' vs ' + JSON.stringify(m.pill))
        if (!inside((m as any)[k], vp)) P(k + ' off screen')
        if ((m as any)[k] && m.where && (m as any)[k].r > m.where.l + 0.5) P(k + ' runs into the stop')
      }
      if (m.vis < Math.min(10, m.name.length)) P(`only ${m.vis} characters of "${m.name}" show before the ellipsis`)
    } else if (!inside(m.label ?? m.pill, m.pill)) P('quiet words outside the pill')
    if (m.inBar) {
      const bm = m.brand.t + m.brand.h / 2, am = m.about.t + m.about.h / 2, pm = m.pill.t + m.pill.h / 2
      if (Math.abs(bm - am) > 4 || Math.abs(bm - pm) > 6) P(`bar on two rows with the pill in it: brand mid ${bm}, last tool mid ${am}, pill mid ${pm}`)
      if (m.bar.h > 58) P('bar is ' + m.bar.h + ' px tall with the pill in it')
    } else {
      if (m.pill.t < m.bar.b - 0.5) P('pill row overlaps the bar')
      if (Math.abs(m.row.l - m.bar.l) > 1) P(`pill row not at the start: row left ${m.row.l}, bar left ${m.bar.l}`)
      if (!inside(m.pill, m.row)) P('pill spills out of its row ' + JSON.stringify({ pill: m.pill, row: m.row }))
      if (!inside(m.row, m.header)) P('pill row outside the header')
    }
    rows.push({ tag, inBar: m.inBar, barH: Math.round(m.bar.h), headerB: Math.round(m.header.b), pill: [Math.round(m.pill.l), Math.round(m.pill.t), Math.round(m.pill.w)], toolsTop: Math.round(m.tools.t), brandTop: Math.round(m.brand.t), vis: m.vis, name: m.name, truncated: m.truncated })
    await step(tag + (m.inBar ? ' pill in bar' : ' pill on its row'))
    // Ruling (3): Overview below the header.
    const headerB = m.header.b
    const ov = page.getByRole('dialog', { name: L.overview })
    if (await ov.isVisible()) {
      const ob = (await ov.boundingBox())!; const oh = await ov.getByRole('heading').first().boundingBox()
      if (ob.y < headerB - 0.5) P(`Overview starts at ${ob.y}, above the header's bottom ${headerB}`)
      if (oh && oh.y < headerB - 0.5) P(`Overview heading at ${oh.y}, above the header's bottom ${headerB}`)
    } else P('no Overview')
    if (QUIET || WIDTHS.indexOf(w) < i) continue
    // Ruling (3): the trip panel opened from the pill, and its highlight chip, below the header.
    await pill.click()
    const d = page.getByRole('dialog', { name: LANG === 'da' ? / mod / : / to / })
    await expect(d).toBeVisible()
    await page.waitForTimeout(1500)
    const hb2 = (await banner.boundingBox())!; const hB = hb2.y + hb2.height
    const db = (await d.boundingBox())!; const dh = (await d.getByRole('heading').first().boundingBox())!
    if (db.y < hB - 0.5) P(`trip panel starts at ${db.y}, above the header's bottom ${hB}`)
    if (dh.y < hB - 0.5) P(`trip panel heading at ${dh.y}, above the header's bottom ${hB}`)
    await d.getByRole('button', { name: L.showLine }).click()
    const chip = page.getByRole('button', { name: L.showing })
    await expect(chip).toBeVisible()
    await page.waitForTimeout(2500)
    const cb = (await chip.boundingBox())!; const hb3 = (await banner.boundingBox())!
    if (cb.y < hb3.y + hb3.height - 0.5) P(`highlight chip at ${cb.y}, above the header's bottom ${hb3.y + hb3.height}`)
    await step(tag + ' trip panel and whole line')
    await chip.click()
    await page.keyboard.press('Escape')
    await expect(d).toBeHidden()
    // The stop panel (Nørreport St.) below the header.
    await page.goto(L.path + '?stop=6584')
    const sp = page.getByRole('dialog', { name: 'Nørreport St.' })
    await expect(sp).toBeVisible()
    await expect(pill).toBeVisible({ timeout: 30000 })
    await page.waitForTimeout(1500)
    const hb4 = (await banner.boundingBox())!; const sb = (await sp.boundingBox())!; const sh = (await sp.getByRole('heading').first().boundingBox())!
    if (sb.y < hb4.y + hb4.height - 0.5) P(`stop panel starts at ${sb.y}, above the header's bottom ${hb4.y + hb4.height}`)
    if (sh.y < hb4.y + hb4.height - 0.5) P(`stop panel heading at ${sh.y}, above the header's bottom ${hb4.y + hb4.height}`)
    await step(tag + ' stop panel')
    await page.goto(L.path)
    await expect(pill).toBeVisible({ timeout: 30000 })
  }
  console.log('ROWS ' + JSON.stringify(rows))
  if (problems.length) throw new Error(problems.join('\n'))
}
