import { afterEach, describe, expect, it } from 'vitest'
import { followStore } from './follow.ts'
import { groundLens } from './highlight.ts'
import { flyOnto, spotlightStore, type FlightMap } from './spotlight.ts'
import { mapView, openPanel } from './view.ts'

// The spotlight, from the Latest now pill (docs/screens.md, "Latest now"): which trip it rings,
// what takes it off, and where the camera flies to show the trip's dot.

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

/** MapLibre's default field of view, in degrees. */
const FOV = 36.87

/** A map `width` by `height` at `zoom`, tilted and turned, whose flights the test reads. */
function mapAt(width: number, height: number, zoom: number, pitch = 0, bearing = 0) {
  const flown: { center?: unknown; zoom?: number; pitch?: number; bearing?: number }[] = []
  const map: FlightMap = {
    flyTo: (options) => {
      flown.push(options as (typeof flown)[number])
      return map as never
    },
    getZoom: () => zoom,
    getPitch: () => pitch,
    getBearing: () => bearing,
    getVerticalFieldOfView: () => FOV,
  }
  /** Where the trip's dot is drawn once the camera has landed. */
  const landed = (point: [number, number]) => {
    const [{ center, zoom: to }] = flown
    return groundLens({ width, height, pitch, bearing, fov: FOV })({
      centre: center as [number, number],
      zoom: to!,
    }).project(point)
  }
  return { map, flown, landed }
}

/** A bus on Nørrebrogade, far from where the map opened. */
const BUS_AT: [number, number] = [12.5502, 55.6948]

describe('the flight to a trip', () => {
  it('lands its dot clear of the header, the Overview sheet and the panel on a desktop', () => {
    // 1280 by 800, the header down to 122 px with the pill on its own row, or to 500 px with page
    // notices under it; the sheet's right edge at 12 + 376 px, the panel's left at 1280 - 12 - 364.
    for (const header of [122, 500]) {
      for (const [pitch, bearing] of [
        [0, 0],
        [50, -30],
      ]) {
        const { map, flown, landed } = mapAt(1280, 800, 11.2, pitch, bearing)
        flyOnto(map, { width: 1280, height: 800 }, BUS_AT, { top: header }, followStore())
        expect(flown).toHaveLength(1)
        const at = landed(BUS_AT)
        expect(at.x).toBeGreaterThan(388 + 24)
        expect(at.x).toBeLessThan(904 - 24)
        expect(at.y).toBeGreaterThan(header + 24)
        expect(at.y).toBeLessThan(800 - 24)
        // It keeps the rider's tilt and heading, coming in to see the streets.
        expect(flown[0].pitch).toBeUndefined()
        expect(flown[0].bearing).toBeUndefined()
        expect(flown[0].zoom).toBe(15)
      }
    }
  })

  it("lands its dot clear of the header and the panel's peek on a phone", () => {
    // 412 by 915, the header down to 138 px with the pill's row; the panel peeks 182 px, Perron's
    // size.sheet-peek, or 500 px where the open sheet measured a taller peek of its own.
    for (const peek of [undefined, 500]) {
      const { map, landed } = mapAt(412, 915, 10.4)
      const floating = { top: 138, ...(peek === undefined ? {} : { peek }) }
      flyOnto(map, { width: 412, height: 915 }, BUS_AT, floating, followStore())
      const at = landed(BUS_AT)
      expect(at.x).toBeGreaterThan(24)
      expect(at.x).toBeLessThan(412 - 24)
      expect(at.y).toBeGreaterThan(138 + 24)
      expect(at.y).toBeLessThan(915 - (peek ?? 182) - 24)
    }
  })

  it('keeps the zoom of a rider already closer in', () => {
    const { map, flown, landed } = mapAt(1280, 800, 16.5)
    flyOnto(map, { width: 1280, height: 800 }, BUS_AT, { top: 70 }, followStore())
    expect(flown[0].zoom).toBe(16.5)
    expect(landed(BUS_AT).x).toBeGreaterThan(412)
    expect(landed(BUS_AT).x).toBeLessThan(880)
  })

  it('ends Follow, which would hold the camera on another dot', () => {
    const follow = followStore()
    openPanel({ kind: 'trip', id: METRO })
    follow.start(METRO)
    const { map } = mapAt(1280, 800, 12)
    flyOnto(map, { width: 1280, height: 800 }, BUS_AT, { top: 70 }, follow)
    expect(follow.get()).toBeUndefined()
  })
})
