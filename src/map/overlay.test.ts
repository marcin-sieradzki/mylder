import '@mylder/perron/tokens.css'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AircraftSnapshot } from '../tracker/aircraft/index.ts'
import type { Snapshot } from '../tracker/index.ts'
import { stubProjection } from '../test/projection.ts'
import { AIRCRAFT_LAYER } from './AircraftGlyphLayer.ts'
import { liveAircraft } from './aircraft.ts'
import { liveSnapshot } from './live.ts'
import { motionPause } from './pause.ts'
import { pickedVehicle } from './picking.ts'
import { vehicleSpotlight } from './spotlight.ts'
import { vehicleOverlay, type VehicleOverlay } from './overlay.ts'
import { mapView, openPanel } from './view.ts'

// deck.gl's overlay draws with WebGL, which jsdom lacks: a stand-in keeps each set of vehicles it
// is given, by the positions the loop moves frame by frame, and the layers of its latest render.
const drawn = vi.hoisted(() => new Set<unknown>())
const rendered = vi.hoisted(() => ({ ids: [] as string[], times: 0, layers: [] as unknown[] }))
interface Moving {
  readonly getPosition: { readonly value: unknown }
  readonly getPixelOffset?: { readonly value: Float32Array }
  readonly getAngle?: { readonly value: Float32Array }
}
interface Drawn {
  readonly id: string
  readonly props: {
    readonly data: { readonly length?: number; readonly attributes?: Moving }
    readonly [prop: string]: unknown
  }
}
const hovering = vi.hoisted(() => ({
  onHover: undefined as ((info: unknown) => void) | undefined,
  onClick: undefined as ((info: unknown) => void) | undefined,
}))
vi.mock('@deck.gl/maplibre', () => ({
  MapLibreOverlay: class {
    constructor({ onHover, onClick }: Record<'onHover' | 'onClick', (info: unknown) => void>) {
      hovering.onHover = onHover
      hovering.onClick = onClick
    }
    setProps({ layers }: { layers: Drawn[] }) {
      rendered.ids = layers.map((layer) => layer.id)
      rendered.layers = layers
      rendered.times++
      const vehicles = layers.find((layer) => layer.id === 'vehicles')
      if (vehicles) drawn.add(vehicles.props.data.attributes!.getPosition.value)
    }
  },
}))

const recording = join(process.cwd(), 'recordings', 'weekday')
const read = (path: string): string => readFileSync(join(recording, path), 'utf8')
const minute6 = JSON.parse(read('snapshots/0006.json')) as Snapshot
const aircraft = JSON.parse(read('answers/aircraft/0006.json')) as AircraftSnapshot
/** The aircraft's server reads the moment it fetched them, as its answer's date header says. */
const atFetch = (snapshot: AircraftSnapshot) => ({
  snapshot,
  clockOffset: aircraft.fetched - Date.now(),
})

/** The paths the page asked for, in order. */
let asked: string[] = []

/** The fetch the page has, which reads the data: URLs Vite inlines small files as. */
const fetchData = globalThis.fetch

/**
 * The timetable routes as the server answers them on the recording, and Perron's aircraft icon as
 * the build hands it over; the snapshot's is down.
 */
const routes = async (input: RequestInfo | URL): Promise<Response> => {
  if (String(input).startsWith('data:')) return fetchData(input)
  asked.push(String(input))
  const manifest = JSON.parse(read('timetable/manifest.json')) as {
    version: string
    files: Record<string, string>
  }
  const [, version, file] = /^\/api\/timetable\/([^/]+)\/(\w+)$/.exec(String(input)) ?? []
  if (version !== manifest.version) return new Response(null, { status: 503 })
  const body =
    file === 'manifest' ? JSON.stringify(manifest) : read(`timetable/${manifest.files[file]}`)
  return new Response(body, { headers: { 'content-type': 'application/json' } })
}

/** MapLibre's part the overlay uses; jsdom can't run MapLibre itself. */
const map = {
  addControl() {},
  removeControl() {},
  on() {},
  off() {},
  getZoom: () => 12,
  getBearing: () => 0,
  getPitch: () => 0,
  getCanvas: () => document.createElement('canvas'),
  project: ([x, y]: [number, number]) => ({ x, y }),
} as unknown as MapLibreMap

let overlay: VehicleOverlay | undefined

beforeEach(() => {
  vi.stubGlobal('fetch', routes)
  asked = []
  drawn.clear()
  rendered.ids = []
  rendered.times = 0
})

afterEach(() => {
  overlay?.remove()
  overlay = undefined
  liveSnapshot.update({ snapshot: undefined, failingSince: undefined })
  liveAircraft.update({ snapshot: undefined, off: undefined, clockOffset: 0 })
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
  motionPause.set(false)
  vehicleSpotlight.clear()
  openPanel(undefined)
  window.history.replaceState(null, '', '/')
})

/** The moving attributes of the layer `id` as last rendered, copied. */
const renderedOf = (id: string) => {
  const layer = (rendered.layers as Drawn[]).find((each) => each.id === id)!
  const { getPixelOffset, getAngle } = layer.props.data.attributes!
  return {
    offsets: getPixelOffset && [...getPixelOffset.value],
    angles: getAngle && [...getAngle.value],
  }
}

/** A map turned to face `bearing`, flat, whose moves the test makes, in the stand-in's camera. */
function turnableMap() {
  const camera = { bearing: 0 }
  const handlers = new Map<string, () => void>()
  const turnable = {
    ...map,
    on: (type: string, handler: () => void) => handlers.set(type, handler),
    getBearing: () => camera.bearing,
    project: (lonLat: [number, number]) =>
      stubProjection({ centre: [12.57, 55.68], zoom: 12, bearing: camera.bearing }).project(lonLat),
  } as unknown as MapLibreMap
  /** Turns the map to `bearing`, as a rider's twist does, and lets the next frame draw. */
  const turnTo = async (bearing: number) => {
    camera.bearing = bearing
    handlers.get('move')!()
    await new Promise((resolve) => requestAnimationFrame(resolve))
  }
  return { turnable, turnTo }
}

describe('the vehicles over the map', () => {
  it('draws each snapshot once when it lands', async () => {
    const container = document.createElement('div')
    overlay = vehicleOverlay(map, container)
    liveSnapshot.update({ snapshot: minute6 })
    await vi.waitFor(() => expect(container.dataset.vehicles).toBe('18'))
    // Whatever else was on its way has landed by the next task.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(drawn.size).toBe(1)
  })

  it('draws the vehicles again when a filter changes, not when the map moves', async () => {
    const container = document.createElement('div')
    liveSnapshot.update({ snapshot: minute6 })
    overlay = vehicleOverlay(map, container)
    await vi.waitFor(() => expect(container.dataset.vehicles).toBe('18'))
    mapView.update({ centre: [12.5683, 55.6761], zoom: 12.5 })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(drawn.size).toBe(1)
    mapView.update({ hidden: new Set(['bus']) })
    await vi.waitFor(() => expect(container.dataset.vehicles).toBe('11'))
    expect(drawn.size).toBe(2)
  })

  it('draws the aircraft above the vehicles, as many as their snapshot holds', async () => {
    const container = document.createElement('div')
    overlay = vehicleOverlay(map, container)
    liveSnapshot.update({ snapshot: minute6 })
    liveAircraft.update(atFetch(aircraft))
    await vi.waitFor(() =>
      expect(container.dataset.aircraft).toBe(String(aircraft.aircraft.length)),
    )
    await vi.waitFor(() => expect(container.dataset.vehicles).toBe('18'))
    expect(rendered.ids).toEqual([
      'vehicle-halos',
      'vehicles',
      'aircraft-halos',
      'aircraft',
      'aircraft-rims',
    ])
    expect(aircraft.aircraft.length).toBe(9)
  })

  it('renders both kinds once in a frame when both land at once', async () => {
    const container = document.createElement('div')
    overlay = vehicleOverlay(map, container)
    liveSnapshot.update({ snapshot: minute6 })
    await vi.waitFor(() => expect(container.dataset.vehicles).toBe('18'))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    const before = rendered.times
    liveAircraft.update(atFetch(aircraft))
    liveAircraft.update(atFetch({ ...aircraft, fetched: aircraft.fetched + 1 }))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(container.dataset.aircraft).toBe('9')
    expect(rendered.times - before).toBe(1)
  })

  it('draws no aircraft, and says none, while the aircraft are off', async () => {
    const container = document.createElement('div')
    overlay = vehicleOverlay(map, container)
    liveSnapshot.update({ snapshot: minute6 })
    liveAircraft.update({ off: true })
    await vi.waitFor(() => expect(container.dataset.vehicles).toBe('18'))
    expect(container.dataset.aircraft).toBeUndefined()
    expect(rendered.ids).not.toContain('aircraft')
  })

  it('takes the aircraft off the map while the Planes filter is off, and draws them again on', async () => {
    const container = document.createElement('div')
    overlay = vehicleOverlay(map, container)
    liveSnapshot.update({ snapshot: minute6 })
    liveAircraft.update(atFetch(aircraft))
    await vi.waitFor(() => expect(container.dataset.aircraft).toBe('9'))
    mapView.update({ aircraftHidden: true })
    await vi.waitFor(() => expect(container.dataset.aircraft).toBeUndefined())
    expect(rendered.ids).toEqual(['vehicle-halos', 'vehicles'])
    // An answer that lands while they are off stays off the map.
    liveAircraft.update(atFetch({ ...aircraft, fetched: aircraft.fetched + 1 }))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(container.dataset.aircraft).toBeUndefined()
    mapView.update({ aircraftHidden: false })
    await vi.waitFor(() => expect(container.dataset.aircraft).toBe('9'))
    expect(rendered.ids).toContain('aircraft')
  })

  it('renders nothing for a state turning by the clock while the Planes filter is off', async () => {
    // The states tick on the clock's timers, which the test moves on.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const container = document.createElement('div')
    overlay = vehicleOverlay(map, container)
    // One aircraft's own position is 19.8 s old at the fetch: it turns Ageing within a second.
    const [turning, ...rest] = aircraft.aircraft
    const soon = { ...turning, age: 19.8, source: 'broadcast', state: 'live' } as const
    liveAircraft.update(atFetch({ ...aircraft, aircraft: [soon, ...rest] }))
    await vi.waitFor(() => expect(container.dataset.aircraft).toBe('9'))
    mapView.update({ aircraftHidden: true })
    await vi.waitFor(() => expect(container.dataset.aircraft).toBeUndefined())
    await new Promise((resolve) => requestAnimationFrame(resolve))
    const before = rendered.times
    await vi.advanceTimersByTimeAsync(1_300)
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(rendered.times).toBe(before)
    mapView.update({ aircraftHidden: false })
    await vi.waitFor(() => expect(container.dataset.aircraft).toBe('9'))
  })

  it('takes the aircraft off the canvas with the Planes filter when no vehicles are drawn', async () => {
    const container = document.createElement('div')
    overlay = vehicleOverlay(map, container)
    liveAircraft.update(atFetch(aircraft))
    await vi.waitFor(() => expect(container.dataset.aircraft).toBe('9'))
    expect(container.dataset.vehicles).toBeUndefined()
    mapView.update({ aircraftHidden: true })
    await vi.waitFor(() => expect(container.dataset.aircraft).toBeUndefined())
    expect(rendered.ids).toEqual([])
    mapView.update({ aircraftHidden: false })
  })

  it('asks for no aircraft while the Planes filter is off, and asks at once when it is on', async () => {
    // A page of its own, whose aircraft poll has not run before.
    vi.resetModules()
    const fresh = {
      overlay: await import('./overlay.ts'),
      view: await import('./view.ts'),
    }
    window.history.replaceState(null, '', '/?hide=aircraft')
    overlay = fresh.overlay.vehicleOverlay(map, document.createElement('div'))
    await vi.waitFor(() => expect(asked).toContain('/api/snapshot'))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(asked).not.toContain('/api/aircraft')
    fresh.view.mapView.update({ aircraftHidden: false })
    expect(asked).toContain('/api/aircraft')
    fresh.view.mapView.update({ aircraftHidden: true })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(asked.filter((path) => path === '/api/aircraft')).toHaveLength(1)
  })

  it("asks for Perron's aircraft outline again when an answer lands after its load failed", async () => {
    // A page of its own, which has not loaded the outline before.
    vi.resetModules()
    const fresh = {
      overlay: await import('./overlay.ts'),
      aircraft: await import('./aircraft.ts'),
    }
    const failing = vi.spyOn(console, 'error').mockImplementation(() => {})
    let iconAsked = 0
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      if (!String(input).startsWith('data:')) return routes(input)
      return iconAsked++ === 0 ? new Response(null, { status: 503 }) : fetchData(input)
    })
    const container = document.createElement('div')
    fresh.aircraft.liveAircraft.update(atFetch(aircraft))
    overlay = fresh.overlay.vehicleOverlay(map, container)
    await vi.waitFor(() => expect(failing).toHaveBeenCalled())
    expect(container.dataset.aircraft).toBeUndefined()
    fresh.aircraft.liveAircraft.update(atFetch({ ...aircraft, fetched: aircraft.fetched + 1 }))
    await vi.waitFor(() => expect(container.dataset.aircraft).toBe('9'))
  })

  it('looks for a stop under the pointer once a frame, however often it moves', async () => {
    const canvas = document.createElement('canvas')
    let looked = 0
    const overStops = {
      ...map,
      getCanvas: () => canvas,
      getLayer: () => ({}),
      queryRenderedFeatures() {
        looked++
        return [{ properties: { id: '27532' }, geometry: { type: 'Point', coordinates: [5, 5] } }]
      },
    } as unknown as MapLibreMap
    overlay = vehicleOverlay(overStops, document.createElement('div'))
    for (let x = 0; x < 5; x++) hovering.onHover!({ picked: false, index: -1, x, y: 5 })
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(looked).toBe(1)
    expect(canvas.style.cursor).toBe('pointer')
  })
  it('opens the panel of a plane tapped, over a stop under it, with a pointer over it', async () => {
    const canvas = document.createElement('canvas')
    const overStops = {
      ...map,
      getCanvas: () => canvas,
      getLayer: () => ({}),
      queryRenderedFeatures: () => [
        { properties: { id: '27532' }, geometry: { type: 'Point', coordinates: [5, 5] } },
      ],
    } as unknown as MapLibreMap
    const container = document.createElement('div')
    overlay = vehicleOverlay(overStops, container)
    liveAircraft.update(atFetch(aircraft))
    await vi.waitFor(() => expect(container.dataset.aircraft).toBe('9'))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    const onPlane = { picked: true, index: 3, layer: { id: AIRCRAFT_LAYER }, x: 5, y: 5 }
    hovering.onHover!(onPlane)
    const hex = pickedVehicle.get()?.key
    expect(aircraft.aircraft.map((each) => each.hex)).toContain(hex)
    expect(canvas.style.cursor).toBe('pointer')
    hovering.onClick!(onPlane)
    expect(mapView.get().panel).toEqual({ kind: 'aircraft', id: hex })
  })
})

describe('the overlay on a turned map', () => {
  it('draws each plane along its track less the heading as the map turns', async () => {
    motionPause.set(true)
    const { turnable, turnTo } = turnableMap()
    const container = document.createElement('div')
    overlay = vehicleOverlay(turnable, container)
    liveAircraft.update(atFetch(aircraft))
    await vi.waitFor(() => expect(container.dataset.aircraft).toBe('9'))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    const shown = aircraft.aircraft.filter((each) => each.track !== undefined)
    const plane = aircraft.aircraft.indexOf(shown[0])
    const track = shown[0].track!
    expect(renderedOf('aircraft').angles![plane]).toBeCloseTo(-track, 3)
    await turnTo(90)
    expect(renderedOf('aircraft').angles![plane]).toBeCloseTo(90 - track, 3)
  })

  it('keeps each dot on its strand as the map turns, though the dots stand still', async () => {
    motionPause.set(true)
    const { turnable, turnTo } = turnableMap()
    const container = document.createElement('div')
    overlay = vehicleOverlay(turnable, container)
    liveSnapshot.update({ snapshot: minute6 })
    await vi.waitFor(() => expect(container.dataset.vehicles).toBe('18'))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    // A train on its strand, where lines share a track, half a track spacing off its centre.
    const flat = renderedOf('vehicles').offsets!
    const i = flat.findIndex((offset) => offset !== 0) >> 1
    const [east, north] = flat.slice(i * 2, i * 2 + 2)
    expect(Math.hypot(east, north)).toBeCloseTo(1.4, 3)
    // Facing east, the ground's north lies to the left of the canvas and its east up it.
    await turnTo(90)
    const [right, up] = renderedOf('vehicles').offsets!.slice(i * 2, i * 2 + 2)
    expect(right).toBeCloseTo(-north, 3)
    expect(up).toBeCloseTo(east, 3)
  })

  it('opens the departures of the stop tapped where a tilted, turned map draws it', () => {
    // Two stops 40 m apart, both under a tap's box; the one nearest the tap where the camera draws
    // them opens.
    const stops = [
      { id: '27532', at: [12.57, 55.68] as [number, number] },
      { id: '8600626', at: [12.5705, 55.6803] as [number, number] },
    ]
    const camera = stubProjection({ centre: [12.57, 55.678], zoom: 16, pitch: 45, bearing: -135 })
    const tilted = {
      ...map,
      getBearing: () => -135,
      getPitch: () => 45,
      getLayer: () => ({}),
      project: camera.project,
      queryRenderedFeatures: () =>
        stops.map(({ id, at }) => ({
          properties: { id },
          geometry: { type: 'Point', coordinates: at },
        })),
    } as unknown as MapLibreMap
    overlay = vehicleOverlay(tilted, document.createElement('div'))
    for (const { id, at } of stops) {
      const { x, y } = camera.project(at)
      hovering.onClick!({ picked: false, index: -1, x: x + 3, y: y - 3 })
      expect(mapView.get().panel).toEqual({ kind: 'stop', id })
    }
  })
})

describe('the spotlight on the map', () => {
  /** The weekday's minute drawn over a flat map at Nørreport, the dots standing still. */
  async function drawnStill() {
    motionPause.set(true)
    const camera = stubProjection({ centre: [12.57, 55.68], zoom: 14 })
    const container = document.createElement('div')
    overlay = vehicleOverlay(
      { ...map, project: camera.project } as unknown as MapLibreMap,
      container,
    )
    liveSnapshot.update({ snapshot: minute6 })
    await vi.waitFor(() => expect(container.dataset.vehicles).toBe('18'))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    return { container, camera }
  }
  const layerOf = (id: string) => (rendered.layers as Drawn[]).find((each) => each.id === id)
  /** The trip on a strand, drawn off its position where lines share a track, by its index. */
  const onStrand = () => renderedOf('vehicles').offsets!.findIndex((offset) => offset !== 0) >> 1
  const ringOn = (key: string) => {
    openPanel({ kind: 'trip', id: key })
    vehicleSpotlight.ring(key)
  }

  it('draws no ring while no trip is rung', async () => {
    const { container } = await drawnStill()
    expect(rendered.ids).toEqual(['vehicle-halos', 'vehicles'])
    expect(container.dataset.spotlight).toBeUndefined()
  })

  it("rings the trip's dot alone, above the vehicles, where the dot is drawn on its strand", async () => {
    const { container, camera } = await drawnStill()
    const i = onStrand()
    const key = minute6.trips.filter((trip) => !trip.cancelled)[i].key
    const vehicles = layerOf('vehicles')!.props.data.attributes!
    const position = [...(vehicles.getPosition.value as Float64Array).slice(i * 2, i * 2 + 2)]
    const offset = [...vehicles.getPixelOffset!.value.slice(i * 2, i * 2 + 2)]
    ringOn(key)
    // The dots stand still: the ring draws on the next frame.
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(rendered.ids).toEqual(['vehicle-halos', 'vehicles', 'spotlight'])
    const ring = layerOf('spotlight')!
    expect(ring.props.data.length).toBe(1)
    expect([...(ring.props.data.attributes!.getPosition.value as Float64Array)]).toEqual(position)
    expect([...ring.props.data.attributes!.getPixelOffset!.value]).toEqual(offset)
    // Where the canvas draws it, for tests: the dot's point, moved onto its strand.
    const at = camera.project(position as [number, number])
    expect(container.dataset.spotlight).toBe(key)
    expect(container.dataset.spotlightAt).toBe(
      `${Math.round(at.x + offset[0])} ${Math.round(at.y - offset[1])}`,
    )
  })

  it("is a ring in Perron's danger colour round the dot's 24 px target, which picks nothing", async () => {
    await drawnStill()
    ringOn(minute6.trips[0].key)
    await new Promise((resolve) => requestAnimationFrame(resolve))
    const { props } = layerOf('spotlight')!
    // color.status.danger in the light theme, #C2410C; size.target-min, 24 px across, and
    // focus.width, 2 px, as deck.gl centres a stroke on its radius.
    expect(props).toMatchObject({
      filled: false,
      stroked: true,
      pickable: false,
      radiusUnits: 'pixels',
      lineWidthUnits: 'pixels',
      billboard: true,
      getLineColor: [194, 65, 12, 255],
    })
    expect((props.getRadius as number) + (props.getLineWidth as number) / 2).toBe(12)
    expect(props.getLineWidth).toBe(2)
  })

  it('changes no other dot', async () => {
    await drawnStill()
    // Every attribute of the vehicles' dots and halos, copied, since the layers keep the same
    // arrays from frame to frame: a write into them would show on both sides of a comparison.
    const copied = () =>
      ['vehicle-halos', 'vehicles'].map((id) => {
        const attributes = layerOf(id)!.props.data.attributes as unknown as Record<
          string,
          { value: ArrayLike<number> }
        >
        return Object.fromEntries(
          Object.entries(attributes).map(([name, { value }]) => [name, Array.from(value)]),
        )
      })
    const before = copied()
    const radiusScale = layerOf('vehicles')!.props.radiusScale
    ringOn(minute6.trips[0].key)
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(rendered.ids).toContain('spotlight')
    expect(copied()).toEqual(before)
    expect(layerOf('vehicles')!.props.radiusScale).toBe(radiusScale)
  })

  it('takes the ring off when its panel closes', async () => {
    const { container } = await drawnStill()
    ringOn(minute6.trips[0].key)
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(rendered.ids).toContain('spotlight')
    openPanel(undefined)
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(rendered.ids).toEqual(['vehicle-halos', 'vehicles'])
    expect(container.dataset.spotlight).toBeUndefined()
    expect(container.dataset.spotlightAt).toBeUndefined()
  })

  it('draws no ring for a trip whose dot is off the map, such as one a filter hides', async () => {
    const { container } = await drawnStill()
    const bus = minute6.trips.find((trip) => trip.mode === 'bus' && !trip.cancelled)!
    ringOn(bus.key)
    mapView.update({ hidden: new Set(['bus']) })
    await vi.waitFor(() => expect(container.dataset.vehicles).toBe('11'))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(rendered.ids).toEqual(['vehicle-halos', 'vehicles'])
    expect(container.dataset.spotlight).toBeUndefined()
  })
})

describe("where a trip's dot is, for a flight to it", () => {
  it('is where the dot is drawn this frame, else where the snapshot put a trip a filter hides', async () => {
    motionPause.set(true)
    const container = document.createElement('div')
    overlay = vehicleOverlay(map, container)
    liveSnapshot.update({ snapshot: minute6 })
    await vi.waitFor(() => expect(container.dataset.vehicles).toBe('18'))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    const train = minute6.trips.find((trip) => trip.mode === 's-tog' && !trip.cancelled)!
    const i = minute6.trips.filter((trip) => !trip.cancelled).indexOf(train)
    const positions = (rendered.layers as Drawn[]).find((each) => each.id === 'vehicles')!.props
      .data.attributes!.getPosition.value as Float64Array
    expect(overlay.whereIs(train.key)).toEqual([positions[i * 2], positions[i * 2 + 1]])
    const bus = minute6.trips.find((trip) => trip.mode === 'bus' && !trip.cancelled)!
    mapView.update({ hidden: new Set(['bus']) })
    await vi.waitFor(() => expect(container.dataset.vehicles).toBe('11'))
    expect(overlay.whereIs(bus.key)).toEqual([bus.position[1], bus.position[0]])
    expect(overlay.whereIs('bus.0.0.20260616.0000')).toBeUndefined()
  })
})
