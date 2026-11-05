import type { Page, Locator } from '@playwright/test'
import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { esc, mapEl, spot, mapParam, waitLanded, ringAt, box } from './lib.ts'

export type Lang = 'en' | 'da'
export const W = {
  en: {
    pill: /^Biggest delay right now: /, updated: /^Updated /, title: 'Latest right now', card: 'The latest trip', to: 'to',
    next: 'Next latest', late: 'min late', nextStop: 'Next stop', sent: /^Delay sent (\d\d:\d\d), by Rejseplanen$/,
    source: /^Of ([\d  ]+) trips with delays from Rejseplanen now\. The Metro and light rail send none\. Updated (\d\d:\d\d:\d\d)$/,
    overview: 'Overview', legend: 'Data states', follow: 'Follow', line: 'Show whole line', close: 'Close', ns: 'next stop', rowNext: 'Next stop: ',
    between: /^Between (.+) and (.+)$/, at: /^(?:Waiting at|At) (.+)$/, pillBetween: /, between (.+) and (.+)$/, pillAt: /, at (.+)$/,
    estimated: 'Estimated', heard: /Timetabled (\d\d:\d\d), expected (\d\d:\d\d)/, showing: /^Showing: line (.+) · Clear$/,
  },
  da: {
    pill: /^Største forsinkelse lige nu: /, updated: /^Opdateret /, title: 'Mest forsinket lige nu', card: 'Den mest forsinkede tur', to: 'mod',
    next: 'Næste mest forsinkede', late: 'min forsinket', nextStop: 'Næste stop', sent: /^Forsinkelse sendt (\d\d:\d\d) af Rejseplanen$/,
    source: /^Ud af ([\d  ]+) ture med forsinkelser fra Rejseplanen nu\. Metroen og letbanen sender ingen\. Opdateret (\d\d:\d\d:\d\d)$/,
    overview: 'Overblik', legend: 'Datatilstande', follow: 'Følg', line: 'Vis hele linjen', close: 'Luk', ns: 'næste stop', rowNext: 'Næste stop: ',
    between: /^Mellem (.+) og (.+)$/, at: /^(?:Venter ved|Ved) (.+)$/, pillBetween: /, mellem (.+) og (.+)$/, pillAt: /, ved (.+)$/,
    estimated: 'Beregnet', heard: /Planlagt (\d\d:\d\d), forventet (\d\d:\d\d)/, showing: /^Viser: linje (.+) · Ryd$/,
  },
}

export const clock = (ms: number) =>
  new Intl.DateTimeFormat('da-DK', { timeZone: 'Europe/Copenhagen', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms).replace('.', ':')
export const clockS = (ms: number) =>
  new Intl.DateTimeFormat('da-DK', { timeZone: 'Europe/Copenhagen', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(ms).replace(/\./g, ':')

export async function snapshot(page: Page) { return (await (await page.request.get('/api/snapshot')).json()) as any }
export function known(s: any) { return s.trips.filter((t: any) => !t.cancelled && t.delay != null && ['live', 'ageing', 'estimated'].includes(t.state)) }
export function ranking(s: any) {
  return known(s).filter((t: any) => t.delay > 0).sort((a: any, b: any) => b.delay - a.delay || (a.key < b.key ? -1 : 1))
}
const routes = new Map<string, any>()
export async function route(page: Page, key: string) {
  const r = await (await page.request.get('/api/trips/' + encodeURIComponent(key))).json()
  routes.set(key, r)
  return r
}
export const mins = (d: number) => Math.round(d / 60)

/** The header's measured bottom: the banner and all inside it (the bar, the pill's row), and any page notice up top. */
export async function headerBottom(page: Page, notices = true) {
  return page.evaluate((notices) => {
    const b = document.querySelector('[role=banner], header')!
    let bottom = b.getBoundingClientRect().bottom
    for (const el of b.querySelectorAll('*')) { const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0) bottom = Math.max(bottom, r.bottom) }
    if (notices) for (const el of document.querySelectorAll('[role=status],[role=alert]')) {
      if (el.closest('[role=dialog]')) continue
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0 && r.top < window.innerHeight / 3) bottom = Math.max(bottom, r.bottom)
    }
    return bottom
  }, notices)
}
export async function noticeBoxes(page: Page) {
  return page.evaluate(() => [...document.querySelectorAll('[role=status],[role=alert]')].filter((e) => !e.closest('[role=dialog]') && !e.closest('[role=banner],header')).map((e) => { const r = e.getBoundingClientRect(); return { text: (e as HTMLElement).innerText.slice(0, 40), left: r.left, top: r.top, right: r.right, bottom: r.bottom } }).filter((r) => r.right > r.left))
}

/** Anything in the dialog that spills past it, scrolls sideways, or is cut by an ellipsis; and the dialog past the screen. */
export async function spills(panel: Locator) {
  return panel.evaluate((dialog) => {
    const box = dialog.getBoundingClientRect()
    const bad: string[] = []
    const vw = document.documentElement.clientWidth
    if (box.left < -0.5 || box.right > vw + 0.5) bad.push(`dialog ${box.left}-${box.right} past the screen ${vw}`)
    if (document.documentElement.scrollWidth > vw + 1) bad.push(`page scrolls sideways ${document.documentElement.scrollWidth}>${vw}`)
    for (const el of dialog.querySelectorAll<HTMLElement>('*')) {
      const r = el.getBoundingClientRect()
      if (r.width <= 1 || r.height <= 1) continue
      const st = getComputedStyle(el)
      if (st.visibility === 'hidden') continue
      const txt = (el.textContent ?? '').trim().slice(0, 40)
      if (r.left < box.left - 0.5 || r.right > box.right + 0.5) bad.push(`spills ${el.tagName}.${el.className} "${txt}" ${Math.round(r.left)}-${Math.round(r.right)} vs ${Math.round(box.left)}-${Math.round(box.right)}`)
      if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1 && st.overflowX !== 'visible') bad.push(`cut/scrolls-x ${el.tagName}.${el.className} "${txt}" ${el.scrollWidth}>${el.clientWidth} (${st.overflowX}, ${st.textOverflow})`)
      if (el.clientHeight > 0 && el.scrollHeight > el.clientHeight + 1 && st.overflowY === 'hidden') bad.push(`cut-y ${el.tagName}.${el.className} "${txt}" ${el.scrollHeight}>${el.clientHeight}`)
      if ((el.scrollWidth > el.clientWidth + 1) && st.overflowX === 'visible' && el.children.length === 0 && el.clientWidth > 0) {
        // a leaf whose text runs past its own box (overflow visible): check it stays within the dialog (done above)
      }
    }
    return bad
  })
}

/** Ring at rest, clear of the header, the Overview sheet (desktop) and the open panel; above the panel and the legend on a phone. */
/** The camera at rest: the address's map has left `from` (when given) and then holds for 2 s, and the ring holds within 4 px over 1 s. */
export async function waitRest(page: Page, from?: string | null, timeoutMs = 25000) {
  const end = Date.now() + timeoutMs
  if (from !== undefined) { while (Date.now() < end && mapParam(page) === from) await page.waitForTimeout(200) }
  let last = mapParam(page)
  while (Date.now() < end) {
    await page.waitForTimeout(2000)
    const now = mapParam(page)
    if (now === last && now) {
      const a = (await mapEl(page).getAttribute('data-spotlight-at'))?.split(' ').map(Number)
      await page.waitForTimeout(1000)
      const b = (await mapEl(page).getAttribute('data-spotlight-at'))?.split(' ').map(Number)
      if (mapParam(page) === now && (!a || !b || Math.hypot(a[0] - b[0], a[1] - b[1]) <= 4)) return now
    }
    last = now
  }
  throw new Error(`camera never came to rest (from ${from}, last ${last})`)
}

/** Samples the address's map and the ring each frame, from now on. */
export async function startSampler(page: Page) {
  await page.evaluate(() => {
    const w = window as any
    w.__samples = []
    w.__t0 = performance.now()
    w.__snaps = []
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name.includes('/api/snapshot')) w.__snaps.push([Math.round(e.startTime - w.__t0), Math.round((e as PerformanceResourceTiming).responseEnd - w.__t0)]) }).observe({ type: 'resource' })
    const el = document.querySelector('[data-vehicles]')!
    const tick = () => {
      w.__samples.push([Math.round(performance.now() - w.__t0), new URLSearchParams(location.search).get('map'), el.getAttribute('data-spotlight-at'), el.getAttribute('data-spotlight')])
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}
/** Waits until the address's map has held for 3 s after leaving `from`; returns the ring at the frame the last change came. */
export async function restSample(page: Page, from?: string | null, timeoutMs = 25000) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    await page.waitForTimeout(500)
    const r = await page.evaluate((from) => {
      const s = (window as any).__samples as [number, string | null, string | null, string | null][]
      const now = s[s.length - 1][0]
      let last = -1
      const values: string[] = []
      for (let i = 1; i < s.length; i++) if (s[i][1] !== s[i - 1][1]) { last = i; values.push(`${s[i][0]}ms ${s[i][1]}`) }
      if (last < 0 && s[0][1] === from) return null
      const at = last < 0 ? 0 : last
      if (now - s[at][0] < 3000) return null
      const jumps: string[] = []
      for (let i = 1; i < s.length; i++) { const a = s[i - 1][2]?.split(' ').map(Number), b = s[i][2]?.split(' ').map(Number); if (a && b && Math.hypot(a[0] - b[0], a[1] - b[1]) > 25 && s[i][1] === s[i - 1][1] && i > at) jumps.push(`${s[i][0]}ms ${s[i - 1][2]}->${s[i][2]}`) }
      return { restAt: s[at][0], map: s[at][1], ring: s[at][2], key: s[at][3], changes: values.slice(-6), nChanges: values.length, ringLater: s[s.length - 1][2], snaps: (window as any).__snaps, jumpsAfterRest: jumps.slice(0, 5) }
    }, from)
    if (r) return r
  }
  throw new Error(`camera never came to rest (from ${from})`)
}

export async function ringClear(page: Page, expect: Journey['expect'], open: Locator, lang: Lang, phone: boolean, label: string, from?: string | null) {
  const rest = await restSample(page, from)
  console.log('rest', JSON.stringify(rest))
  const landed = rest.map
  let geom: any
  await expect(async () => {
    const s = { key: rest.key, at: rest.ring }
    expect(s.at, 'ring drawn').toBeTruthy()
    const [x, y] = s.at!.split(' ').map(Number)
    const hb = await headerBottom(page)
    const vp = page.viewportSize()!
    const pb = await box(page, open)
    geom = { label, key: s.key, x, y, headerBottom: hb, panel: pb, vp, map: landed }
    expect(y - 12, `${label}: ring top below the header`).toBeGreaterThan(hb)
    expect(y + 12, `${label}: ring inside the screen`).toBeLessThan(vp.height)
    expect(x - 12).toBeGreaterThan(0)
    expect(x + 12).toBeLessThan(vp.width)
    if (!phone) {
      const ov = page.getByRole('dialog', { name: W[lang].overview })
      if (await ov.isVisible()) { const ob = await box(page, ov); geom.overview = ob; expect(x - 12, `${label}: ring right of the Overview sheet`).toBeGreaterThan(ob.right) }
      expect(x + 12, `${label}: ring left of the panel`).toBeLessThan(pb.left)
    } else {
      const lg = await box(page, page.getByRole('list', { name: W[lang].legend })).catch(() => null)
      geom.legend = lg
      expect(y + 12, `${label}: ring above the panel's top`).toBeLessThan(pb.top)
      if (lg) expect(y + 12, `${label}: ring above the legend`).toBeLessThan(lg.top)
    }
  }).toPass({ timeout: 8000 })
  console.log('ring', JSON.stringify(geom))
  const r = await ringAt(page, geom.x, geom.y, undefined, true)
  const inClear = r.y - 12 > geom.headerBottom && (phone ? r.y + 12 < Math.min(geom.panel.top, geom.legend?.top ?? 1e9) : r.x + 12 < geom.panel.left && r.x - 12 > (geom.overview?.right ?? 0))
  console.log('ring pixels', JSON.stringify(r), inClear ? '' : 'NOTE: the dot has since moved out of the clear room (it moves on; the camera stays)')
  if (inClear) expect(r.sectors, `${label}: a red ring drawn round the dot`).toBeGreaterThanOrEqual(12)
  return geom
}

export async function waitStandout(page: Page, expect: Journey['expect'], lang: Lang) {
  await expect(page.getByRole('banner').getByText(W[lang].updated)).toBeVisible({ timeout: 60000 })
  const pill = page.getByRole('banner').getByRole('button', { name: W[lang].pill })
  await expect(pill).toBeVisible({ timeout: 90000 })
  return pill
}

export async function dims(page: Page, width?: number) { if (width) await page.setViewportSize({ width, height: 800 }) }
