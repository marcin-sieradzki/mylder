import type { Page } from '@playwright/test'
import { writeFileSync, appendFileSync } from 'node:fs'

export const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const log = (page: Page, msg: string) => {
  console.log(msg)
}

export interface Top { key: string; line: string; headsign: string; mins: number }
export async function top(page: Page): Promise<Top | undefined> {
  const s = await (await page.request.get('/api/snapshot')).json()
  const t = s.trips.filter((t: any) => !t.cancelled && t.delay != null && ['live', 'ageing', 'estimated'].includes(t.state))
  t.sort((a: any, b: any) => b.delay - a.delay || (a.key < b.key ? -1 : 1))
  if (!t[0]) return undefined
  return { key: t[0].key, line: t[0].line, headsign: t[0].headsign, mins: Math.round(t[0].delay / 60) }
}

export const pillOf = (page: Page, lang: 'en' | 'da' = 'en') =>
  page.getByRole('banner').getByRole('button', { name: lang === 'en' ? /^Biggest delay right now: / : /^Største forsinkelse lige nu: / })

export const mapEl = (page: Page) => page.locator('[data-vehicles]')

export async function spot(page: Page) {
  return mapEl(page).evaluate((e) => ({ key: e.getAttribute('data-spotlight'), at: e.getAttribute('data-spotlight-at') }))
}

export const mapParam = (page: Page) => new URL(page.url()).searchParams.get('map')

/** Waits until the address's camera stops changing for 1.5 s. */
export async function waitLanded(page: Page, timeoutMs = 20000) {
  const end = Date.now() + timeoutMs
  let last = mapParam(page)
  while (Date.now() < end) {
    await page.waitForTimeout(1500)
    const now = mapParam(page)
    if (now === last && now) return now
    last = now
  }
  throw new Error(`camera never came to rest in ${timeoutMs} ms (last map=${last})`)
}

/** Header's measured bottom: the banner and every piece inside it (the bar and the pill's row). */
export async function headerBottom(page: Page) {
  return page.getByRole('banner').evaluate((b) => {
    let bottom = b.getBoundingClientRect().bottom
    for (const el of b.querySelectorAll('*')) {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) bottom = Math.max(bottom, r.bottom)
    }
    return bottom
  })
}

/** Ring analysis on a full-page screenshot, decoded in the page: red pixels (near #C2410C) on the ring band
 * around (x, y) by 16 sectors, and red pixels elsewhere in a given clear rectangle. */
export async function ringAt(page: Page, x: number, y: number, clear?: { left: number; top: number; right: number; bottom: number }, follow = true) {
  const at = async () => (await page.locator('[data-vehicles]').getAttribute('data-spotlight-at'))?.split(' ').map(Number)
  const a = follow ? await at() : undefined
  const png = (await page.screenshot()).toString('base64')
  const b = follow ? await at() : undefined
  if (a && b) { x = (a[0] + b[0]) / 2; y = (a[1] + b[1]) / 2 }
  return page.evaluate(async ({ png, x, y, clear }) => {
    const img = new Image()
    img.src = 'data:image/png;base64,' + png
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width; c.height = img.height
    const g = c.getContext('2d')!
    g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, c.width, c.height).data
    const scale = img.width / window.innerWidth
    const red = (i: number) => { const r = d[i], gg = d[i + 1], b = d[i + 2]; return Math.hypot(r - 194, gg - 65, b - 12) < 45 }
    const sectors = new Set<number>()
    let band = 0
    const cx = x * scale, cy = y * scale
    for (let py = Math.floor(cy - 16 * scale); py <= cy + 16 * scale; py++) for (let px = Math.floor(cx - 16 * scale); px <= cx + 16 * scale; px++) {
      if (px < 0 || py < 0 || px >= c.width || py >= c.height) continue
      const dist = Math.hypot(px - cx, py - cy) / scale
      if (dist < 7 || dist > 16) continue
      if (red((py * c.width + px) * 4)) { band++; sectors.add(Math.floor(((Math.atan2(py - cy, px - cx) + Math.PI) / (2 * Math.PI)) * 16) % 16) }
    }
    let elsewhere = 0
    const spots: string[] = []
    if (clear) {
      for (let py = Math.floor(clear.top * scale); py < clear.bottom * scale; py++) for (let px = Math.floor(clear.left * scale); px < clear.right * scale; px++) {
        if (px < 0 || py < 0 || px >= c.width || py >= c.height) continue
        if (Math.hypot(px - cx, py - cy) / scale <= 20) continue
        if (red((py * c.width + px) * 4)) { elsewhere++; if (spots.length < 10) spots.push(`${Math.round(px / scale)},${Math.round(py / scale)}`) }
      }
    }
    return { x, y, sectors: sectors.size, band, elsewhere, spots }
  }, { png, x, y, clear })
}

export async function box(page: Page, loc: ReturnType<Page['locator']>) {
  const b = await loc.boundingBox()
  if (!b) throw new Error('no box')
  return { left: b.x, top: b.y, right: b.x + b.width, bottom: b.y + b.height }
}

/** Pixels that differ (any channel by more than 24) between two screenshots inside a rectangle,
 * leaving out a disc of radius r around (x, y); and the boxes of the changed areas on a 20 px grid. */
export async function diff(page: Page, a: Buffer, b: Buffer, rect: { left: number; top: number; right: number; bottom: number }, x: number, y: number, r: number, skip: { left: number; top: number; right: number; bottom: number }[] = []) {
  return page.evaluate(async ({ a, b, rect, x, y, r, skip }) => {
    const load = async (s: string) => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const g = c.getContext('2d')!; g.drawImage(i, 0, 0); return { w: i.width, d: g.getImageData(0, 0, i.width, i.height).data } }
    const A = await load(a), B = await load(b)
    const scale = A.w / window.innerWidth
    let n = 0
    const cells = new Map<string, number>()
    for (let py = Math.floor(rect.top * scale); py < rect.bottom * scale; py++) for (let px = Math.floor(rect.left * scale); px < rect.right * scale; px++) {
      if (Math.hypot(px / scale - x, py / scale - y) <= r) continue
      if (skip.some((k) => px / scale >= k.left - 10 && px / scale <= k.right + 10 && py / scale >= k.top - 10 && py / scale <= k.bottom + 10)) continue
      const i = (py * A.w + px) * 4
      if (Math.abs(A.d[i] - B.d[i]) > 24 || Math.abs(A.d[i + 1] - B.d[i + 1]) > 24 || Math.abs(A.d[i + 2] - B.d[i + 2]) > 24) {
        n++
        const k = `${Math.floor(px / scale / 20) * 20},${Math.floor(py / scale / 20) * 20}`
        cells.set(k, (cells.get(k) ?? 0) + 1)
      }
    }
    return { changed: n, cells: [...cells.entries()].sort((p, q) => q[1] - p[1]).slice(0, 12) }
  }, { a: a.toString('base64'), b: b.toString('base64'), rect, x, y, r, skip })
}

/** Boxes of the map's own chrome (controls, legend, scale, credit, notices), which move when a panel opens. */
export async function chrome(page: Page) {
  return page.evaluate(() => {
    const out: { left: number; top: number; right: number; bottom: number }[] = []
    const add = (e: Element | null) => { if (!e) return; const r = e.getBoundingClientRect(); if (r.width) out.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom }) }
    add(document.querySelector('[role=toolbar][aria-label="Map controls"]'))
    // the tools' container: the controls and the scale bar's card beside them
    add(document.querySelector('[role=toolbar][aria-label="Map controls"]')?.parentElement ?? null)
    const legend = document.querySelector('[role=list][aria-label="Data states"]'); add(legend?.parentElement ?? null); add(legend)
    for (const el of document.querySelectorAll('body *')) {
      const t = (el as HTMLElement).innerText
      if (el.children.length < 4 && t && (/^Scale /.test(t) || /^\d+\s(m|km)$/.test(t) || /^Transit data:/.test(t))) { add(el); if (/^Scale |^\d+\s(m|km)$/.test(t)) { add(el.parentElement); add(el.parentElement?.parentElement ?? null) } }
    }
    for (const el of document.querySelectorAll('[role=status]')) if (!el.closest('[role=dialog]')) add(el)
    return out
  })
}
