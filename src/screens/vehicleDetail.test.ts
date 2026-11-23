import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { TripDetail } from '../tracker/index'
import { nextCallOf, shownDelayOf } from './vehicleDetail'

// The next call an opened vehicle's panel names (GLOSSARY.md, "Next call"), from the trip answer
// saved in recordings/siri-et at 09:22 on Saturday 31 October 2026: bus 68 to Lyngby St., which
// skips Otto Mønsteds Plads (call 13) at 09:32, between Weidekampsgade at 09:29 and Polititorvet
// at 09:33.
const skips = JSON.parse(
  readFileSync(
    join(process.cwd(), 'recordings/siri-et/answers/trips/bus.68.bb4e5908a5.20261031.0916.json'),
    'utf8',
  ),
) as TripDetail

describe('the next call of an opened vehicle', () => {
  it('passes by a call the trip skips', () => {
    const weidekampsgade = skips.calls[12].expectedDeparture!
    expect(nextCallOf(skips, weidekampsgade - 1_000)).toBe(12)
    expect(nextCallOf(skips, weidekampsgade + 1_000)).toBe(14)
  })

  it('is none once the trip has arrived, so its delay is the answer’s', () => {
    const arrived = skips.calls.at(-1)!.expectedArrival! + 1_000
    expect(nextCallOf(skips, arrived)).toBeUndefined()
    expect(shownDelayOf(skips, undefined, nextCallOf(skips, arrived))).toBe(skips.delay)
  })

  it('is none for a trip cancelled whole', () => {
    expect(nextCallOf({ ...skips, cancelled: true }, skips.fetched)).toBeUndefined()
  })
})
