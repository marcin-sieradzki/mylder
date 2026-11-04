// The spotlight, from the Latest now pill (docs/screens.md, "Latest now"): a ring on the map round
// one trip's dot, drawn by the overlay (overlay.ts) where the dot is each frame, so the rider finds
// it among the others. It rings the trip the rider picked, whose vehicle panel is open, and stays
// on it while the ranking changes, until its panel closes or another opens in its place.
import 'client-only'
import { mapView, type ViewStore } from './view.ts'

export interface SpotlightStore {
  /** The ringed trip's key; none while nothing is ringed. */
  get(): string | undefined
  /** Rings the trip `key`, whose panel is open, until its panel closes or another is rung. */
  ring(key: string): void
  clear(): void
  /** Calls back whenever the ringed trip changes; returns the function that stops it. */
  subscribe(onChange: () => void): () => void
}

/** A store ringing nothing, which lets go of a trip when `view` no longer has its panel open. */
export function spotlightStore(view: ViewStore = mapView): SpotlightStore {
  let ringed: string | undefined
  let stopWatching: (() => void) | undefined
  const listeners = new Set<() => void>()
  const set = (to: string | undefined) => {
    if (to === ringed) return
    ringed = to
    for (const listener of listeners) listener()
  }
  const clear = () => {
    stopWatching?.()
    stopWatching = undefined
    set(undefined)
  }
  return {
    get: () => ringed,
    ring(key) {
      stopWatching?.()
      stopWatching = view.subscribe(() => {
        const { panel } = view.get()
        if (panel?.kind !== 'trip' || panel.id !== ringed) clear()
      })
      set(key)
    },
    clear,
    subscribe(onChange) {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
  }
}

/** The page's one spotlight, which the pill rings and the canvas draws. */
export const vehicleSpotlight = spotlightStore()
