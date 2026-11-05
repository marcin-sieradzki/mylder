import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { searchWith, type MapView, type PanelKind } from './view'

// The verifier reaches a screen through the address, so the handles line of the verify-mylder
// skill names every parameter the page writes. In #237's run a new panel's parameter reached the
// feature file but not that line. Record<PanelKind, …> fails the type check when a kind is added.
const PANEL_IDS: Readonly<Record<PanelKind, string>> = {
  stop: 'stop-1',
  trip: 'trip-1',
  aircraft: 'plane-1',
  latest: 'now',
}

const views: MapView[] = [
  ...Object.entries(PANEL_IDS).map(([kind, id]) => ({
    hidden: new Set<never>(),
    panel: { kind: kind as PanelKind, id },
  })),
  {
    hidden: new Set(['bus']),
    aircraftHidden: true,
    centre: [12.565, 55.68],
    zoom: 11.2,
    bearing: -35,
    pitch: 50,
    panel: { kind: 'stop', id: 'stop-1' },
    board: 'arrivals',
    tab: 'vehicles',
  },
]

describe("the verify-mylder skill's handles", () => {
  it('name every parameter the address writes', () => {
    const handles = readFileSync('.claude/skills/verify-mylder/SKILL.md', 'utf8')
      .split('\n')
      .find((line) => line.startsWith('Handles, most stable first:'))
    const written = new Set(
      views.flatMap((view) => [...new URLSearchParams(searchWith('', view)).keys()]),
    )
    expect([...written].sort()).toEqual([
      'aircraft',
      'board',
      'hide',
      'latest',
      'map',
      'stop',
      'tab',
      'trip',
    ])
    for (const key of written) expect(handles).toContain(`?${key}=`)
  })
})
