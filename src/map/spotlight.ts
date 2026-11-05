// The spotlight, from the Latest now pill and the Latest right now panel (docs/screens.md, "Latest
// now"): a ring on the map round one trip's dot, drawn by the overlay (overlay.ts,
// SpotlightLayer.ts) where the dot is each frame, so the rider finds it among the others, and the
// flight that brings the camera to it. It rings the trip the rider picked, whose vehicle panel or
// the Latest right now panel is open, and stays on it while the ranking changes, until that panel
// closes or another opens in its place. The camera flies once, as the trip is picked, and is the
// rider's again from then on.
import 'client-only'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { useSyncExternalStore } from 'react'
import { followedVehicle, type FollowStore } from './follow.ts'
import {
  FIT_ZOOM,
  fitPadding,
  groundLens,
  placeOn,
  type Floating,
  type Padding,
} from './highlight.ts'
import { liveSnapshot } from './live.ts'
import { EASE_FOR, FADE_FOR } from './motion.ts'
import { holdsTrip, LATEST_NOW, mapView, openPanel, type ViewStore } from './view.ts'

export interface SpotlightStore {
  /** The ringed trip's key; none while nothing is ringed. */
  get(): string | undefined
  /**
   * Rings the trip `key`, whose panel or the Latest right now panel is open, until that panel
   * closes or another is rung.
   */
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
        if (!holdsTrip(view.get().panel, ringed)) clear()
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

/**
 * The ringed trip's key, for a component such as the Latest right now panel, whose picked trip it
 * is: it renders again when the ring moves or goes. The prerendered page rings none.
 */
export function useSpotlight(store: SpotlightStore = vehicleSpotlight): string | undefined {
  return useSyncExternalStore(store.subscribe, store.get, () => undefined)
}

export interface FlightStore {
  /** Asks the map to fly to the trip `key`'s dot. */
  fly(key: string): void
  /** Hears each flight asked for, by its trip's key; returns the function that stops it. */
  subscribe(onFlight: (key: string) => void): () => void
}

/** Flights asked for, heard by the map that flies them (BaseMap.tsx); none kept for later. */
export function flightStore(): FlightStore {
  const listeners = new Set<(key: string) => void>()
  return {
    fly(key) {
      for (const listener of listeners) listener(key)
    },
    subscribe(onFlight) {
      listeners.add(onFlight)
      return () => listeners.delete(onFlight)
    },
  }
}

/** The page's flights, which the pill asks for and the canvas flies. */
export const vehicleFlight = flightStore()

/**
 * Picks the trip `key`, as a row of the Latest right now panel does: opens its vehicle panel in
 * the address, rings its dot and flies the camera to it.
 */
export function spotlightTrip(key: string): void {
  openPanel({ kind: 'trip', id: key })
  vehicleSpotlight.ring(key)
  vehicleFlight.fly(key)
}

/**
 * Opens the Latest right now panel in the address, as the Latest now pill does: on the trip `key`,
 * the latest, whose dot it rings and the camera flies to, or with none picked, as when no trip is
 * 3 min late, ringing nothing and ending Follow, whose trip's panel it replaces.
 */
export function spotlightLatest(key: string | undefined): void {
  openPanel({ kind: 'latest', id: LATEST_NOW })
  if (key === undefined) {
    vehicleSpotlight.clear()
    followedVehicle.stop()
    return
  }
  vehicleSpotlight.ring(key)
  vehicleFlight.fly(key)
}

/** The part of MapLibre's map a flight moves and reads. */
export type FlightMap = Pick<
  MapLibreMap,
  'flyTo' | 'getZoom' | 'getPitch' | 'getBearing' | 'getVerticalFieldOfView'
>

type Area = { readonly width: number; readonly height: number }

/** The room a flight lands a dot in, clear of what floats over the map, and where it would land. */
function aim(
  map: FlightMap,
  area: Area,
  point: [number, number],
  floating: Floating,
  zoom: number,
) {
  const lens = groundLens({
    ...area,
    pitch: map.getPitch(),
    bearing: map.getBearing(),
    fov: map.getVerticalFieldOfView(),
  })
  const padding = fitPadding(area.width, area.height, floating, { foot: true })
  return { padding, place: placeOn(point, { centre: point, zoom }, zoom, area, padding, lens) }
}

/**
 * Flies `map`, `area` wide and high, to `point`, a dot's longitude and latitude, landing it in the
 * middle of the room clear of what floats over the map, as a highlight's fit keeps clear of it
 * (`fitPadding`): the header, the pill's row and the page notices included, the Overview sheet and
 * the open panel on a desktop, the header, the panel's peek and the map's foot standing on it on a
 * phone. It comes in to zoom 15, the streets in view, or keeps a closer zoom, keeps the rider's
 * tilt and heading, and ends Follow, whose camera would hold it on another dot. Under reduced
 * motion MapLibre jumps rather than flies.
 */
export function flyOnto(
  map: FlightMap,
  area: Area,
  point: [number, number],
  floating: Floating,
  follow: FollowStore = followedVehicle,
): void {
  const { place } = aim(map, area, point, floating, Math.max(map.getZoom(), FIT_ZOOM))
  follow.stop()
  map.flyTo({ center: place.centre, zoom: place.zoom })
}

/** The part of MapLibre's map a flight to a trip moves, reads and listens to. */
export type FlightCamera = FlightMap &
  Pick<MapLibreMap, 'easeTo' | 'getCenter' | 'project' | 'isMoving' | 'on' | 'off'>

/** What a flight to a trip reads as it goes, from the screen and the overlay. */
export interface FlightDeps {
  /** Where the trip's dot is drawn now (overlay.ts). */
  whereIs(key: string): [number, number] | undefined
  /** The map's size now. */
  area(): Area
  /** What floats over the map now. */
  floating(): Floating
  /** Hears each snapshot land; returns the function that stops it. */
  onLanding?(heard: () => void): () => void
}

/** How long a dot takes to reach its place in a snapshot that just landed (motion.ts). */
const SETTLE = Math.max(EASE_FOR, FADE_FOR)

/** How long a re-aim eases, in ms. */
const REAIM_FOR = 600

/** The most re-aims one flight makes, so a dot that keeps moving never holds the camera. */
const REAIMS = 3

/** The input events of a rider taking the map, which end a flight's re-aims. */
const TAKES = ['mousedown', 'touchstart', 'wheel'] as const

/** Hears each new transit snapshot land in the page's store. */
function snapshotLandings(heard: () => void): () => void {
  let last = liveSnapshot.get().snapshot
  return liveSnapshot.subscribe(() => {
    const { snapshot } = liveSnapshot.get()
    if (snapshot === last) return
    last = snapshot
    heard()
  })
}

/** Whether `at`, px on a map `area` big, lies in the room `padding` leaves. */
const inRoom = (at: { x: number; y: number }, area: Area, padding: Padding) =>
  at.x >= padding.left &&
  at.x <= area.width - padding.right &&
  at.y >= padding.top &&
  at.y <= area.height - padding.bottom

/**
 * Flies `map` to the trip `key`'s dot (`flyOnto`) and sees it land: each time the camera comes to
 * rest, once the dot has reached its place in any snapshot that landed meanwhile, a dot outside
 * the clear room, moved by that snapshot, is aimed at again with a short ease, at the zoom the
 * camera came to, a few times at most. A dot in the room ends it: from then on the camera is the
 * rider's, and keeping it on the dot is Follow's. So does the rider taking the map, any other
 * move, Follow starting, a new flight, or the trip no longer picked, the `spotlight` off it as its
 * panel closes or another opens. Returns the function that ends it.
 */
export function flyToTrip(
  map: FlightCamera,
  key: string,
  { whereIs, area, floating, onLanding = snapshotLandings }: FlightDeps,
  follow: FollowStore = followedVehicle,
  spotlight: SpotlightStore = vehicleSpotlight,
): () => void {
  const point = whereIs(key)
  if (!point) return () => {}
  // Whether one of the flight's own moves is being asked for now, and whether one is under way:
  // MapLibre ends a move under way, at its moveend, as a new one starts, and starts it, at its
  // movestart, before the call returns; under reduced motion it ends it too.
  let calling = false
  let moving = false
  let reaims = 0
  let landedAt: number | undefined
  let check: ReturnType<typeof setTimeout> | undefined
  const stopLanding = onLanding(() => (landedAt = Date.now()))
  const end = () => {
    if (check !== undefined) clearTimeout(check)
    check = undefined
    stopLanding()
    map.off('movestart', onMoveStart)
    map.off('moveend', onMoveEnd)
    for (const type of TAKES) map.off(type, end)
  }
  const own = (move: () => void) => {
    calling = true
    try {
      move()
    } finally {
      calling = false
    }
  }
  /** Where the camera has come to rest: the dot in the room, or aimed at again. */
  const settled = () => {
    check = undefined
    if (map.isMoving() || follow.get() !== undefined || spotlight.get() !== key) return end()
    const at = whereIs(key)
    if (!at) return end()
    const size = area()
    const { padding, place } = aim(map, size, at, floating(), map.getZoom())
    if (inRoom(map.project(at), size, padding) || reaims >= REAIMS) return end()
    reaims++
    own(() => map.easeTo({ center: place.centre, zoom: place.zoom, duration: REAIM_FOR }))
  }
  // A move the flight didn't start, such as an arrow key's pan, takes the map from it.
  function onMoveStart() {
    if (calling) moving = true
    else end()
  }
  // Its own move at rest, it looks once the dot has reached its place in a snapshot that landed
  // meanwhile, and after any move that took over has had its start.
  function onMoveEnd() {
    if (!moving) return
    moving = false
    const left = landedAt === undefined ? 0 : landedAt + SETTLE - Date.now()
    if (check !== undefined) clearTimeout(check)
    check = setTimeout(settled, Math.max(0, left))
  }
  map.on('movestart', onMoveStart)
  map.on('moveend', onMoveEnd)
  for (const type of TAKES) map.on(type, end)
  own(() => flyOnto(map, area(), point, floating(), follow))
  return end
}
