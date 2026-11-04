import { afterEach, describe, expect, it } from 'vitest'
import { spotlightStore } from './spotlight.ts'
import { mapView, openPanel } from './view.ts'

// The spotlight, from the Latest now pill (docs/screens.md, "Latest now"): which trip it rings,
// and what takes it off.

const BUS = 'bus.5C.32331e0e20.20260616.0707'
const METRO = 'metro.M1.7f21f99145.20260616.0707'

afterEach(() => {
  openPanel(undefined)
  window.history.replaceState(null, '', '/')
})

describe('the spotlight', () => {
  it('rings the trip it was given, whose panel is open, and tells its listeners', () => {
    const spotlight = spotlightStore()
    let heard = 0
    spotlight.subscribe(() => heard++)
    expect(spotlight.get()).toBeUndefined()
    openPanel({ kind: 'trip', id: BUS })
    spotlight.ring(BUS)
    expect(spotlight.get()).toBe(BUS)
    expect(heard).toBe(1)
  })

  it('stays on its trip while the map moves and the filters change', () => {
    const spotlight = spotlightStore()
    openPanel({ kind: 'trip', id: BUS })
    spotlight.ring(BUS)
    mapView.update({ centre: [12.57, 55.68], zoom: 15 })
    mapView.update({ hidden: new Set(['metro']) })
    expect(spotlight.get()).toBe(BUS)
  })

  it("goes when its trip's panel closes", () => {
    const spotlight = spotlightStore()
    openPanel({ kind: 'trip', id: BUS })
    spotlight.ring(BUS)
    openPanel(undefined)
    expect(spotlight.get()).toBeUndefined()
  })

  it('goes when another panel opens in its place, a trip or a stop', () => {
    const spotlight = spotlightStore()
    openPanel({ kind: 'trip', id: BUS })
    spotlight.ring(BUS)
    openPanel({ kind: 'trip', id: METRO })
    expect(spotlight.get()).toBeUndefined()
    spotlight.ring(METRO)
    openPanel({ kind: 'stop', id: '8600626' })
    expect(spotlight.get()).toBeUndefined()
  })

  it('moves to the trip it is given next, and goes once cleared', () => {
    const spotlight = spotlightStore()
    openPanel({ kind: 'trip', id: BUS })
    spotlight.ring(BUS)
    openPanel({ kind: 'trip', id: METRO })
    spotlight.ring(METRO)
    expect(spotlight.get()).toBe(METRO)
    spotlight.clear()
    expect(spotlight.get()).toBeUndefined()
    // Cleared, it no longer watches the panel: the next trip's panel rings nothing.
    openPanel({ kind: 'trip', id: BUS })
    expect(spotlight.get()).toBeUndefined()
  })
})
