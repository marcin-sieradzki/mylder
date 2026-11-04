import { afterEach, describe, expect, it, vi } from 'vitest'
import { followStore } from './follow.ts'
import { groundLens, type Floating } from './highlight.ts'
import {
  flyOnto,
  flyToTrip,
  spotlightStore,
  type FlightCamera,
  type FlightMap,
} from './spotlight.ts'
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

  it("lands its dot above the map's foot on a phone, not beside the legend and the controls", () => {
    // The legend, the controls and the credit stand on the panel's peek, up to 460 px from the
    // foot of a 915 px phone, under a header down to 228 px with a page notice.
    const { map, landed } = mapAt(412, 915, 10.4)
    flyOnto(map, { width: 412, height: 915 }, BUS_AT, { top: 228, bottom: 460 }, followStore())
    const at = landed(BUS_AT)
    expect(at.y).toBeGreaterThan(228 + 24)
    expect(at.y).toBeLessThan(915 - 460 - 24)
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

/**
 * A map `width` by `height` whose camera goes straight to where a move aims and stays moving
 * until the test brings it to rest, as MapLibre's does at a move's end, flat and north-up.
 */
function flyingMap(width: number, height: number, zoom: number, moving = false) {
  const camera = { centre: [12.565, 55.68] as [number, number], zoom, moving }
  const handlers = new Map<string, Set<(event: object) => void>>()
  const emit = (type: string, event: object = {}) => {
    for (const handler of handlers.get(type) ?? []) handler(event)
  }
  const moves: { kind: 'fly' | 'ease'; duration?: number }[] = []
  const move = (kind: 'fly' | 'ease') => (options: object) => {
    const {
      center,
      zoom: to,
      duration,
    } = options as {
      center: [number, number]
      zoom?: number
      duration?: number
    }
    moves.push({ kind, ...(duration === undefined ? {} : { duration }) })
    // A move under way ends, at its moveend, as MapLibre stops it for the new one.
    if (camera.moving) {
      camera.moving = false
      emit('moveend')
    }
    camera.centre = center
    camera.zoom = to ?? camera.zoom
    camera.moving = true
    emit('movestart')
    return map as never
  }
  const lens = () =>
    groundLens({ width, height, pitch: 0, bearing: 0, fov: FOV })({
      centre: camera.centre,
      zoom: camera.zoom,
    })
  const map: FlightCamera = {
    flyTo: move('fly'),
    easeTo: move('ease'),
    getZoom: () => camera.zoom,
    getPitch: () => 0,
    getBearing: () => 0,
    getVerticalFieldOfView: () => FOV,
    getCenter: () => ({ lng: camera.centre[0], lat: camera.centre[1] }) as never,
    project: (point) => lens().project(point as [number, number]) as never,
    isMoving: () => camera.moving,
    on: ((type: string, handler: (event: object) => void) => {
      if (!handlers.has(type)) handlers.set(type, new Set())
      handlers.get(type)!.add(handler)
      return map
    }) as never,
    off: ((type: string, handler: (event: object) => void) => {
      handlers.get(type)?.delete(handler)
      return map
    }) as never,
  }
  /** The camera comes to rest where the move aimed. */
  const rest = () => {
    camera.moving = false
    emit('moveend')
  }
  /** Where `point` is drawn now. */
  const drawn = (point: [number, number]) => lens().project(point)
  return { map, moves, rest, emit, drawn }
}

/** The bus a snapshot moved 2 km on up Nørrebrogade while the camera flew to where it was. */
const MOVED: [number, number] = [12.5345, 55.7085]

describe('the flight to a trip, as snapshots land', () => {
  const area = { width: 1280, height: 800 }
  const floating: Floating = { top: 122 }
  /** Expects `at` in the room clear of the header, the Overview sheet and the panel, at 1280. */
  const expectClear = (at: { x: number; y: number }) => {
    expect(at.x).toBeGreaterThan(388 + 24)
    expect(at.x).toBeLessThan(904 - 24)
    expect(at.y).toBeGreaterThan(122 + 24)
    expect(at.y).toBeLessThan(800 - 24)
  }
  /** A flight to the bus at `BUS_AT`, its dot where `where` says, and a snapshot to land. */
  function flying(follow = followStore(), moving = false) {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const camera = flyingMap(area.width, area.height, 11.2, moving)
    let where: [number, number] = BUS_AT
    const landings = new Set<() => void>()
    const end = flyToTrip(
      camera.map,
      BUS,
      {
        whereIs: (key) => (key === BUS ? where : undefined),
        area: () => area,
        floating: () => floating,
        onLanding: (heard) => {
          landings.add(heard)
          return () => landings.delete(heard)
        },
      },
      follow,
    )
    const moveTo = (to: [number, number]) => (where = to)
    /** A snapshot lands and moves the dot to `to`. */
    const land = (to: [number, number]) => {
      moveTo(to)
      for (const heard of landings) heard()
    }
    return { ...camera, end, land, moveTo, follow }
  }

  afterEach(() => {
    vi.useRealTimers()
  })

  it('re-aims with a short ease when a snapshot moves the dot mid-flight', () => {
    const flight = flying()
    expect(flight.moves).toEqual([{ kind: 'fly' }])
    flight.land(MOVED)
    flight.rest()
    vi.advanceTimersByTime(1_000)
    expect(flight.moves).toHaveLength(2)
    expect(flight.moves[1].kind).toBe('ease')
    expect(flight.moves[1].duration).toBeLessThanOrEqual(800)
    flight.rest()
    vi.advanceTimersByTime(1_000)
    expectClear(flight.drawn(MOVED))
    // Landed in the room, it moves the camera no more.
    expect(flight.moves).toHaveLength(2)
  })

  it('waits for the dot to reach its new place, when a snapshot lands just before the camera rests', () => {
    const flight = flying()
    // The dot eases from where it was to the snapshot's place over a second.
    flight.land([12.5428, 55.7016])
    vi.advanceTimersByTime(700)
    flight.rest()
    vi.advanceTimersByTime(100)
    // Not looked at yet: the dot reaches the snapshot's place a second after it landed.
    expect(flight.moves).toHaveLength(1)
    flight.moveTo(MOVED)
    vi.advanceTimersByTime(200)
    flight.rest()
    vi.advanceTimersByTime(1_000)
    expect(flight.moves.map((move) => move.kind)).toEqual(['fly', 'ease'])
    expectClear(flight.drawn(MOVED))
  })

  it('moves the camera no more when the dot lands in the room', () => {
    const flight = flying()
    flight.rest()
    vi.advanceTimersByTime(2_000)
    expect(flight.moves).toEqual([{ kind: 'fly' }])
    expectClear(flight.drawn(BUS_AT))
  })

  it('does not chase the dot once landed: that is Follow', () => {
    const flight = flying()
    flight.rest()
    vi.advanceTimersByTime(2_000)
    flight.land(MOVED)
    flight.rest()
    vi.advanceTimersByTime(2_000)
    expect(flight.moves).toEqual([{ kind: 'fly' }])
  })

  it('lets the rider have the map once they touch it, or move it otherwise, mid-flight', () => {
    for (const take of [
      (flight: ReturnType<typeof flying>) => flight.emit('mousedown'),
      (flight: ReturnType<typeof flying>) => {
        // An arrow key's pan takes over: the flight's move ends, then the pan's starts.
        flight.rest()
        flight.emit('movestart')
      },
    ]) {
      const flight = flying()
      flight.land(MOVED)
      take(flight)
      flight.rest()
      vi.advanceTimersByTime(2_000)
      expect(flight.moves).toEqual([{ kind: 'fly' }])
      flight.end()
    }
  })

  it('leaves the camera to Follow, started during the flight', () => {
    const follow = followStore()
    openPanel({ kind: 'trip', id: BUS })
    const flight = flying(follow)
    follow.start(BUS)
    flight.land(MOVED)
    flight.rest()
    vi.advanceTimersByTime(2_000)
    expect(flight.moves).toEqual([{ kind: 'fly' }])
  })

  it('re-aims a few times at most, however often the dot moves on', () => {
    const flight = flying()
    for (let i = 0; i < 6; i++) {
      flight.land(i % 2 === 0 ? MOVED : BUS_AT)
      flight.rest()
      vi.advanceTimersByTime(1_000)
      // Each landing moves the dot away from where the last ease aimed.
      flight.land(i % 2 === 0 ? BUS_AT : MOVED)
    }
    expect(flight.moves.filter((move) => move.kind === 'ease').length).toBeLessThanOrEqual(3)
  })

  it('takes off while another move is under way, whose end is not its own', () => {
    // Such as the inertia of the rider's last drag, which the flight stops.
    const flight = flying(followStore(), true)
    flight.land(MOVED)
    flight.rest()
    vi.advanceTimersByTime(1_000)
    expect(flight.moves.map((move) => move.kind)).toEqual(['fly', 'ease'])
  })

  it('ends when asked, as a new flight starts', () => {
    const flight = flying()
    flight.end()
    flight.land(MOVED)
    flight.rest()
    vi.advanceTimersByTime(2_000)
    expect(flight.moves).toEqual([{ kind: 'fly' }])
  })
})
