'use client'

// The Latest now outcome for the page (docs/screens.md, "Latest now"), ticking by the server's
// clock, read by the top bar, which places the pill, by the pill and by the Latest right now panel.
import { useSyncExternalStore } from 'react'
import { liveSnapshot, type LiveSnapshot } from '../map/live'
import { tickingStore } from '../map/ticking'
import { latestOf, type Latest } from './latest'

/** Whether two outcomes say the same: the same trips of the same snapshot, the same figures. */
function sameLatest(a: Latest | undefined, b: Latest | undefined): boolean {
  if (a === b) return true
  if (!a || !b || a.kind !== b.kind) return false
  switch (a.kind) {
    case 'standout':
    case 'calm': {
      const other = b as typeof a
      return (
        a.count === other.count &&
        a.trips.length === other.trips.length &&
        a.trips.every(
          (each, i) => each.trip === other.trips[i].trip && each.state === other.trips[i].state,
        )
      )
    }
    case 'quiet':
      return a.since === (b as typeof a).since
    case 'none':
      return true
  }
}

/**
 * The page's outcome, by the server's clock: it moves on when a snapshot lands, and on the second a
 * trip's delay is no longer known or the feed goes quiet.
 */
const latestNow = tickingStore(
  ({ snapshot }: LiveSnapshot, now: number) => snapshot && latestOf(snapshot, now),
  sameLatest,
  liveSnapshot,
)

/** The pill's outcome now, for a component: it renders again when the outcome changes. */
export const useLatest = (): Latest | undefined =>
  useSyncExternalStore(latestNow.subscribe, latestNow.get, () => undefined)
