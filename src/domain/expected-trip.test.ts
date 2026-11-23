import { describe, expect, it } from 'vitest'
import { expectedTrip, type Known } from './expected-trip'
import type { Call } from './trip-motion'

const t0 = Date.UTC(2026, 9, 26, 7, 0)
const minutes = (n: number) => t0 + n * 60_000

// Leaves A at 07:00, at B from 07:10 to 07:11, arrives at C at 07:15.
const planned: Call[] = [
  { arrival: minutes(0), departure: minutes(0) },
  { arrival: minutes(10), departure: minutes(11) },
  { arrival: minutes(15), departure: minutes(15) },
]

/** Each call's expected arrival and departure, in minutes after 07:00. */
type Times = readonly (readonly [arrival: number, departure: number])[]

interface Row {
  readonly calls?: readonly Call[]
  readonly known: Known
  /** The moment asked about, in minutes after 07:00. */
  readonly at: number
  /** Its expected times, or none when nothing known times it. */
  readonly times: Times | undefined
  readonly skips: readonly number[]
  readonly next: number | undefined
  readonly delayAtNext: number | undefined
  readonly latestDelay: number | undefined
}

describe('a trip’s expected calls', () => {
  it.each<[string, Row]>([
    [
      'with nothing known keeps its plan and gives no delay',
      {
        known: {},
        at: 5,
        times: undefined,
        skips: [],
        next: 1,
        delayAtNext: undefined,
        latestDelay: undefined,
      },
    ],
    [
      'with a Delay alone shifts every call by it',
      {
        known: { delay: 60 },
        at: 5,
        times: [
          [1, 1],
          [11, 12],
          [16, 16],
        ],
        skips: [],
        next: 1,
        delayAtNext: 60,
        latestDelay: 60,
      },
    ],
    [
      'with delay steps times each call by the step at or before it',
      {
        known: {
          steps: [
            [0, 120],
            [1, 300],
          ],
        },
        at: 5,
        times: [
          [2, 2],
          [12, 16],
          [20, 20],
        ],
        skips: [],
        next: 1,
        delayAtNext: 300,
        latestDelay: 300,
      },
    ],
    [
      'with delay steps runs the calls before the first step late by it, whatever the Delay',
      {
        known: { steps: [[1, 180]], delay: -60 },
        at: 0.5,
        times: [
          [3, 3],
          [13, 14],
          [18, 18],
        ],
        skips: [],
        next: 0,
        delayAtNext: 180,
        latestDelay: 180,
      },
    ],
    [
      'with a step at the last stop gives its arrival',
      {
        known: { steps: [[2, 300]] },
        at: 17,
        times: [
          [5, 5],
          [15, 16],
          [20, 20],
        ],
        skips: [],
        next: 2,
        delayAtNext: 300,
        latestDelay: 300,
      },
    ],
    [
      'with an answer’s expected time runs the calls before it late by the Delay',
      {
        calls: [planned[0], { ...planned[1], expectedDeparture: minutes(14) }, planned[2]],
        known: { delay: 60 },
        at: 5,
        times: [
          [1, 1],
          [11, 14],
          [18, 18],
        ],
        skips: [],
        next: 1,
        delayAtNext: 180,
        latestDelay: 180,
      },
    ],
    [
      'with an answer’s expected time and a step at one call takes the answer’s',
      {
        calls: [planned[0], { ...planned[1], expectedDeparture: minutes(13) }, planned[2]],
        known: { steps: [[1, 300]] },
        at: 12.5,
        times: [
          [2, 2],
          [12, 13],
          [17, 17],
        ],
        skips: [],
        next: 1,
        delayAtNext: 120,
        latestDelay: 120,
      },
    ],
    [
      'never lets a time run back before the one before it',
      {
        calls: [
          { arrival: minutes(0), departure: minutes(2), expectedDeparture: minutes(4) },
          { arrival: minutes(3), departure: minutes(3), expectedArrival: minutes(3) },
        ],
        known: {},
        at: 3.5,
        times: [
          [2, 4],
          [4, 4],
        ],
        skips: [],
        next: 0,
        delayAtNext: 120,
        latestDelay: 0,
      },
    ],
    [
      'with a cancelled call passes it by for the next call',
      {
        known: { delay: 60, cancelledCalls: [1] },
        at: 5,
        times: [
          [1, 1],
          [11, 12],
          [16, 16],
        ],
        skips: [1],
        next: 2,
        delayAtNext: 60,
        latestDelay: 60,
      },
    ],
    [
      'cancelled whole serves no call and has no next call',
      {
        known: { delay: 60, cancelled: true },
        at: 5,
        times: [
          [1, 1],
          [11, 12],
          [16, 16],
        ],
        skips: [0, 1, 2],
        next: undefined,
        delayAtNext: 60,
        latestDelay: 60,
      },
    ],
    [
      'Waiting has its first stop as its next call',
      {
        known: { delay: 120 },
        at: 1,
        times: [
          [2, 2],
          [12, 13],
          [17, 17],
        ],
        skips: [],
        next: 0,
        delayAtNext: 120,
        latestDelay: 120,
      },
    ],
    [
      'arrived at its last stop has no next call',
      {
        known: { delay: 60 },
        at: 16,
        times: [
          [1, 1],
          [11, 12],
          [16, 16],
        ],
        skips: [],
        next: undefined,
        delayAtNext: 60,
        latestDelay: 60,
      },
    ],
  ])('a trip %s', (_, row) => {
    const trip = expectedTrip(row.calls ?? planned, row.known)
    const now = minutes(row.at)
    const inMinutes = (time: number) => (time - t0) / 60_000
    expect(
      trip.expected
        ? trip.times.map(({ arrival, departure }) => [inMinutes(arrival), inMinutes(departure)])
        : undefined,
    ).toEqual(row.times)
    expect(trip.times.map((_, i) => i).filter((i) => trip.skips(i))).toEqual(row.skips)
    expect(trip.nextCall(now)).toBe(row.next)
    expect(trip.delayAtNext(now)).toBe(row.delayAtNext)
    expect(trip.latestDelay).toBe(row.latestDelay)
  })

  it('lists the calls ahead, cancelled or not, at the time each is shown: the departure, the last’s arrival', () => {
    const trip = expectedTrip(planned, { steps: [[1, 120]], cancelledCalls: [1] })
    expect(trip.ahead(minutes(3))).toEqual([
      { index: 1, time: minutes(13) },
      { index: 2, time: minutes(17) },
    ])
    expect(trip.nextCall(minutes(3))).toBe(2)
  })
})
