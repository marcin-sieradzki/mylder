'use client'

// Where the Latest now pill sits (docs/screens.md, "Latest now"): in the top bar's tools while the
// bar keeps it on its one row with "Latest now", the badge, the delay and the start of the stop's
// name in view, else on a row of its own at the start under the bar, the bar's full width its
// room. Decided from the bar as it is laid out, whatever its chips, their counts, the language or
// the Updated line say: measured whenever the header, the Updated line or the pill changes size,
// and after each render of the bar, and set only when it changes.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

/** The pill in the bar's tools, at most `room` px wide, or on its row under the bar. */
export type Placement =
  { readonly place: 'bar'; readonly room?: number } | { readonly place: 'row' }

export const ROW: Placement = { place: 'row' }

/** How much of the stop's name the pill keeps in view in the bar before it takes its row. */
const STOP_KEPT = 10

/**
 * The px more than its least the pill must have room for to move from its row into the bar: it
 * leaves the bar only below its least, so a pixel's rounding either way never moves it back.
 */
export const MARGIN = 8

/** What the bar's layout says of the pill, as `measure` reads it off the page. */
export interface Measure {
  /**
   * The words and the width the layout follows from, the same wherever the pill sits: the
   * header's width, the Updated line, the chips' words and counts, and the pill's own words.
   */
  readonly key: string
  /** Whether the pill is in the bar's tools now. */
  readonly inBar: boolean
  /** Whether the bar is on one row, its chips too. */
  readonly oneRow: boolean
  /** The room the bar has for the pill in its tools, in px. */
  readonly room: number
  /** The pill's width with all its words on one line. */
  readonly natural: number
  /** The least it may take: its stop's name cut after `STOP_KEPT` characters, or all its words. */
  readonly least: number
}

/** A placement decided, and the layout, by its key, where the bar last wrapped with the pill. */
export interface Decided {
  readonly placement: Placement
  readonly wrapped?: string
}

const samePlacement = (a: Placement, b: Placement) =>
  a.place === b.place && (a.place === 'row' || a.room === (b as typeof a).room)

/**
 * The placement a measure asks for, after `previous`; `previous` itself when it asks for no
 * change. It settles in a step or two whatever the layout answers:
 *
 * - In the bar, the pill takes its row once the bar wraps or its room falls below its least, and
 *   a layout that wrapped the bar is kept by its key, so the pill never tries the bar again until
 *   the header's width or the words change.
 * - On its row, it moves into the bar only with `MARGIN` px to spare over its least.
 * - In the bar its room only shrinks, or grows by more than a pixel, so rounding never rocks it.
 */
export function decide(previous: Placement, measured: Measure, wrapped?: string): Decided {
  const keep = (placement: Placement, kept = wrapped): Decided => ({
    placement: samePlacement(placement, previous) ? previous : placement,
    ...(kept === undefined ? {} : { wrapped: kept }),
  })
  const { key, inBar, oneRow, room, natural, least } = measured
  if (inBar) {
    if (!oneRow) return keep(ROW, key)
    if (room < least) return keep(ROW)
  } else if (!oneRow || wrapped === key || room < least + MARGIN) {
    return keep(ROW)
  }
  // Its room in the bar, none where its words all fit; it only shrinks, or grows by over a pixel.
  const wanted = room >= natural ? Infinity : Math.floor(room)
  const had = previous.place === 'bar' ? (previous.room ?? Infinity) : undefined
  const next = had === undefined || wanted < had || Math.floor(room) > had + 1 ? wanted : had
  return keep(next === Infinity ? { place: 'bar' } : { place: 'bar', room: next })
}

const widthOf = (element: Element) => element.getBoundingClientRect().width

/** The boxes of a range of text, one a line; none where the browser can't say, as jsdom can't. */
function rangeRects(fill: (range: Range) => void): DOMRect[] {
  const range = document.createRange()
  fill(range)
  return typeof range.getClientRects === 'function' ? [...range.getClientRects()] : []
}

/**
 * The pill's width with all its words on one line, and the least it may take: for a trip, with
 * its stop's name cut after `STOP_KEPT` characters and an ellipsis, the room of one more; for a
 * line of words, all of them.
 */
function pillWidths(pill: HTMLElement): { natural: number; least: number } {
  const where = pill.querySelector<HTMLElement>('[data-latest-where]')
  const stop = pill.querySelector<HTMLElement>('[data-latest-stop]')
  if (!where || !stop) {
    // A line of words: its lines' widths together.
    const lines = rangeRects((range) => range.selectNodeContents(pill))
    const natural = Math.max(
      widthOf(pill),
      lines.reduce((sum, rect) => sum + rect.width, 0),
    )
    return { natural, least: natural }
  }
  const hidden = where.scrollWidth - where.clientWidth
  const natural = widthOf(pill) + hidden
  const text = stop.firstChild
  const kept = Math.min(STOP_KEPT + 1, text?.textContent?.length ?? 0)
  if (!text || kept <= STOP_KEPT) return { natural, least: natural }
  const [last] = rangeRects((range) => {
    range.setStart(text, kept - 1)
    range.setEnd(text, kept)
  })
  if (!last) return { natural, least: natural }
  const whereLeast = last.right - where.getBoundingClientRect().left
  return { natural, least: natural - where.scrollWidth + whereLeast }
}

/** The bar's parts the placement reads. */
export interface BarParts {
  readonly header: RefObject<HTMLElement | null>
  readonly identity: RefObject<HTMLElement | null>
  readonly filters: RefObject<HTMLElement | null>
  readonly tools: RefObject<HTMLElement | null>
}

/**
 * The bar's layout as it is now. With the pill in the tools, its room is its own width and what
 * the centred chips leave beside them; with the pill under the bar, what the chips leave less the
 * tools' gap. A pixel short of it all, so a width rounded on its way into the bar never wraps it.
 * None until the parts are on the page, or just after the pill moves, when the render's pill is
 * the one it left.
 */
function measure(parts: BarParts, pill: HTMLElement | null): Measure | undefined {
  const header = parts.header.current
  const identity = parts.identity.current
  const filters = parts.filters.current
  const tools = parts.tools.current
  if (!pill?.isConnected || !header || !identity || !filters || !tools) return undefined
  const inBar = tools.contains(pill)
  const firstRow = identity.getBoundingClientRect().bottom
  const chips = [...filters.children].map((chip) => chip.getBoundingClientRect())
  const oneRow =
    tools.getBoundingClientRect().top < firstRow &&
    filters.getBoundingClientRect().top < firstRow &&
    chips.every((chip) => Math.abs(chip.top - chips[0].top) < 1)
  const span =
    chips.length === 0
      ? 0
      : Math.max(...chips.map((chip) => chip.right)) - Math.min(...chips.map((chip) => chip.left))
  const free = Math.max(0, widthOf(filters) - span)
  const gap = parseFloat(getComputedStyle(tools).columnGap) || 0
  const room = (inBar ? widthOf(pill) + free : free - gap) - 1
  const key = [
    Math.round(widthOf(header)),
    identity.textContent,
    [...filters.children].map((chip) => chip.textContent).join('|'),
    pill.textContent,
  ].join('\n')
  return { key, inBar, oneRow, room, ...pillWidths(pill) }
}

/**
 * The pill's placement on a screen wider than a phone, and the ref its element takes. It starts on
 * its row and moves into the bar where the bar has room, measured before the browser paints, so it
 * never shows in the wrong place. `watch` turns it off, as on a phone, whose pill always has its
 * row.
 */
export function useLatestPlace(
  parts: BarParts,
  watch: boolean,
): { placement: Placement; pillRef: (pill: HTMLElement | null) => void } {
  const [placement, setPlacement] = useState<Placement>(ROW)
  const current = useRef(placement)
  const wrapped = useRef<string | undefined>(undefined)
  const pill = useRef<HTMLElement | null>(null)
  const observer = useRef<ResizeObserver | null>(null)
  const watching = useRef(watch)
  const { header, identity, filters, tools } = parts

  const settle = useCallback(() => {
    if (!watching.current) return
    const measured = measure({ header, identity, filters, tools }, pill.current)
    if (!measured) return
    const decided = decide(current.current, measured, wrapped.current)
    wrapped.current = decided.wrapped
    if (decided.placement === current.current) return
    current.current = decided.placement
    setPlacement(decided.placement)
  }, [header, identity, filters, tools])

  const pillRef = useCallback((element: HTMLElement | null) => {
    if (pill.current) observer.current?.unobserve(pill.current)
    pill.current = element
    if (element) observer.current?.observe(element)
  }, [])

  // The header's size, the Updated line's or the pill's, as the window resizes or the fonts load,
  // decides again, there and then.
  useEffect(() => {
    if (!watch || typeof ResizeObserver === 'undefined') return
    const resized = new ResizeObserver(settle)
    observer.current = resized
    for (const element of [header.current, identity.current, pill.current]) {
      if (element) resized.observe(element)
    }
    return () => {
      resized.disconnect()
      observer.current = null
    }
  }, [watch, settle, header, identity])

  // After every render of the bar, as its chips' counts, its Updated line or the pill's words may
  // have changed; it sets the placement only when it changes, and `decide` settles.
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- measured after every render, on purpose
  useLayoutEffect(() => {
    watching.current = watch
    settle()
  })

  return { placement, pillRef }
}
