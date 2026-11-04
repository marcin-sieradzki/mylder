// The spotlight, from the Latest now pill (docs/screens.md, "Latest now"): a ring on the map round
// one trip's dot, drawn by the overlay (overlay.ts, SpotlightLayer.ts) where the dot is each frame,
// so the rider finds it among the others, and the flight that brings the camera to it. It rings
// the trip the rider picked, whose vehicle panel is open, and stays on it while the ranking
// changes, until its panel closes or another opens in its place. The camera flies once, as the
// trip is picked, and is the rider's again from then on.
import 'client-only'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { followedVehicle, type FollowStore } from './follow.ts'
import { FIT_ZOOM, fitPadding, groundLens, placeOn, type Floating } from './highlight.ts'
import { mapView, openPanel, type ViewStore } from './view.ts'

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
 * Picks the trip `key`, as the Latest now pill does: opens its vehicle panel in the address, rings
 * its dot and flies the camera to it.
 */
export function spotlightTrip(key: string): void {
  openPanel({ kind: 'trip', id: key })
  vehicleSpotlight.ring(key)
  vehicleFlight.fly(key)
}

/** The part of MapLibre's map a flight moves and reads. */
export type FlightMap = Pick<
  MapLibreMap,
  'flyTo' | 'getZoom' | 'getPitch' | 'getBearing' | 'getVerticalFieldOfView'
>

/**
 * Flies `map`, `area` wide and high, to `point`, a dot's longitude and latitude, landing it in the
 * middle of the room clear of what floats over the map, as a highlight's fit keeps clear of it
 * (`fitPadding`): the header, the pill's row included, the Overview sheet and the open panel on a
 * desktop, the header, the panel's peek and the map's foot standing on it on a phone. It comes in to zoom 15, the streets in
 * view, or keeps a closer zoom, keeps the rider's tilt and heading, and ends Follow, whose camera
 * would hold it on another dot. Under reduced motion MapLibre jumps rather than flies.
 */
export function flyOnto(
  map: FlightMap,
  area: { readonly width: number; readonly height: number },
  point: [number, number],
  floating: Floating,
  follow: FollowStore = followedVehicle,
): void {
  const zoom = Math.max(map.getZoom(), FIT_ZOOM)
  const lens = groundLens({
    ...area,
    pitch: map.getPitch(),
    bearing: map.getBearing(),
    fov: map.getVerticalFieldOfView(),
  })
  const padding = fitPadding(area.width, area.height, floating, { foot: true })
  const place = placeOn(point, { centre: point, zoom }, zoom, area, padding, lens)
  follow.stop()
  map.flyTo({ center: place.centre, zoom: place.zoom })
}
