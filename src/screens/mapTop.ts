'use client'

import { useLayoutEffect, type RefObject } from 'react'

/**
 * Sets `--map-top` on the page's root: the bottom edge of the map screen's header, in px from the
 * window's top, the top bar however many rows it takes and the Latest now pill's row when it has
 * one. The Overview sheet, the detail panels and the highlight chip start below it
 * (CitySheet.module.css, DetailPanels.module.css, MapHighlight.module.css); they open in portals
 * outside the screen, so it sits on the root, which they inherit it from. Measured before the
 * first paint and whenever the header changes size; until then they fall back on the bar's height
 * on one row.
 */
export function useMapTop(header: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const element = header.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const root = document.documentElement
    const measure = () =>
      root.style.setProperty('--map-top', `${element.getBoundingClientRect().bottom}px`)
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    measure()
    return () => {
      observer.disconnect()
      root.style.removeProperty('--map-top')
    }
  }, [header])
}
