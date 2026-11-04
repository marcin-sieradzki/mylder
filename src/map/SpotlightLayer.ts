// The spotlight's deck.gl layer (spotlight.ts): one ring round the rung trip's dot, above the
// vehicles, where the dot is drawn this frame, its position moved by its offset onto its strand as
// the dot's is, facing the screen at one size in px however the map is tilted (ADR 0016). Its
// colour and size are Perron's: color.status.danger, round the dot's 24 px tap target
// (size.target-min), as wide as a focus ring (focus.width). It picks nothing, so a tap on it is a
// tap on the dot. WebGL is not tested in jsdom.
import 'client-only'
import type { Layer } from '@deck.gl/core'
import { parseColour, type RGBA } from './glyphs.ts'
import { numberOf, type Paint } from './paint.ts'
import type { Vehicles } from './vehicles.ts'
import { VehicleGlyphLayer } from './VehicleGlyphLayer.ts'

/** The id of the ring's layer. */
export const SPOTLIGHT_LAYER = 'spotlight'

const COLOUR = 'perron-color-status-danger'
const ACROSS = 'perron-size-target-min'
const WIDTH = 'perron-focus-width'

/** Every token the ring reads, for `readPaint`. */
export const spotlightTokens = (): string[] => [COLOUR, ACROSS, WIDTH]

/** The ring under one theme: its colour, and its radius and stroke in px. */
export interface SpotlightLook {
  readonly colour: RGBA
  /** deck.gl centres the stroke on the radius, so the ring's outer edge is radius + width / 2. */
  readonly radius: number
  readonly width: number
}

/** The ring's look in the paint read now. */
export function spotlightLookOf(paint: Paint): SpotlightLook {
  const width = numberOf(paint, WIDTH)
  return {
    colour: parseColour(paint.get(COLOUR) ?? '') ?? [0, 0, 0, 255],
    radius: numberOf(paint, ACROSS) / 2 - width / 2,
    width,
  }
}

/** The ring round the `i`th of `vehicles`, where the motion has placed it this frame. */
export function spotlightLayer(vehicles: Vehicles, i: number, look: SpotlightLook): Layer {
  return new VehicleGlyphLayer({
    id: SPOTLIGHT_LAYER,
    data: {
      length: 1,
      attributes: {
        // Copied, so deck.gl uploads them again each frame.
        getPosition: { value: vehicles.positions.slice(i * 2, i * 2 + 2), size: 2 },
        getPixelOffset: { value: vehicles.offsets.slice(i * 2, i * 2 + 2), size: 2 },
      },
    },
    radiusUnits: 'pixels',
    billboard: true,
    lineWidthUnits: 'pixels',
    filled: false,
    stroked: true,
    antialiasing: true,
    getRadius: look.radius,
    getLineWidth: look.width,
    getLineColor: [...look.colour],
    pickable: false,
  })
}
