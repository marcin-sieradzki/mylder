'use client'

// Where the Latest now pill sits (docs/screens.md, "Latest now"): in the top bar's tools while the
// bar keeps it on its one row with "Latest now", the badge, the delay and the start of the stop's
// name in view, else on a row of its own under the bar. Decided from the bar as it is laid out,
// whatever its chips, their counts, the language or the Updated line say, measured again whenever
// the header changes size or the bar or the pill renders again.
import { useEffect, useLayoutEffect, useState, type RefObject } from 'react'

/** The pill in the bar's tools, at most `room` px wide, or on its row under the bar. */
export type Placement =
  { readonly place: 'bar'; readonly room?: number } | { readonly place: 'row' }

const ROW: Placement = { place: 'row' }

/** How much of the stop's name the pill keeps in view in the bar before it takes its row. */
export const STOP_KEPT = 10

/** The bar's parts the placement reads, and the pill's own element. */
export interface PlaceParts {
  readonly header: RefObject<HTMLElement | null>
  readonly identity: RefObject<HTMLElement | null>
  readonly filters: RefObject<HTMLElement | null>
  readonly tools: RefObject<HTMLElement | null>
  readonly pill: HTMLElement | null
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

/**
 * The placement the bar's layout allows now. With the pill in the tools, the bar must still be on
 * one row, its chips too; the pill then has its own width and the room the centred chips leave
 * beside them. With the pill under the bar, the room is what the chips leave, less the tools' gap,
 * none when the bar is on two rows without it.
 */
function placementOf(parts: PlaceParts): Placement | undefined {
  const identity = parts.identity.current
  const filters = parts.filters.current
  const tools = parts.tools.current
  const { pill } = parts
  // Just after the pill moves, the render's pill is the one it left, out of the page: the next
  // render, with the new one, measures.
  if (!pill?.isConnected || !identity || !filters || !tools) return undefined
  const inBar = tools.contains(pill)
  const firstRow = identity.getBoundingClientRect().bottom
  const chips = [...filters.children].map((chip) => chip.getBoundingClientRect())
  const oneRow =
    tools.getBoundingClientRect().top < firstRow &&
    filters.getBoundingClientRect().top < firstRow &&
    chips.every((chip) => Math.abs(chip.top - chips[0].top) < 1)
  if (!oneRow) return ROW
  const span =
    chips.length === 0
      ? 0
      : Math.max(...chips.map((chip) => chip.right)) - Math.min(...chips.map((chip) => chip.left))
  const free = Math.max(0, widthOf(filters) - span)
  const gap = parseFloat(getComputedStyle(tools).columnGap) || 0
  // A pixel short of it all, so a width rounded on its way into the bar never wraps it.
  const room = (inBar ? widthOf(pill) + free : free - gap) - 1
  const { natural, least } = pillWidths(pill)
  if (room < least) return ROW
  return room >= natural ? { place: 'bar' } : { place: 'bar', room: Math.floor(room) }
}

const samePlacement = (a: Placement, b: Placement) =>
  a.place === b.place && (a.place === 'row' || a.room === (b as typeof a).room)

/**
 * The pill's placement on a screen wider than a phone, measured after each render before the
 * browser paints, so it never shows in the wrong place: it starts on its row and moves into the
 * bar where the bar has room. `watch` turns it off, as on a phone, whose pill always has its row.
 */
export function useLatestPlace(parts: PlaceParts, watch: boolean): Placement {
  const [placement, setPlacement] = useState<Placement>(ROW)
  const [, remeasure] = useState(0)
  const { header, identity } = parts
  const { pill } = parts

  // A change of the header's size, the Updated line's or the pill's, as its fonts load, asks again.
  useEffect(() => {
    if (!watch || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => remeasure((count) => count + 1))
    for (const element of [header.current, identity.current, pill]) {
      if (element) observer.observe(element)
    }
    return () => observer.disconnect()
  }, [watch, header, identity, pill])

  // After every render, as anything in the bar or the pill may have moved; it settles, since a
  // placement measured again where it put the pill comes out the same.
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- measured after every render, on purpose
  useLayoutEffect(() => {
    if (!watch) return
    const next = placementOf(parts)
    // oxlint-disable-next-line react/set-state-in-effect -- a layout measured before paint, as React's docs measure one
    if (next && !samePlacement(next, placement)) setPlacement(next)
  })

  return placement
}
