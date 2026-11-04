import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Snapshot, SnapshotTrip } from '../tracker/index'
import { latestOf, type Latest } from './latest'

const MINUTE = 60_000

/** A saved snapshot of a recording's minute. */
const saved = (recording: string, name: string): Snapshot =>
  JSON.parse(
    readFileSync(join(process.cwd(), 'recordings', recording, 'snapshots', name), 'utf8'),
  ) as Snapshot

/**
 * The timetable source with SIRI-ET's delays, its second saved minute, 09:22:00 in Copenhagen on
 * Saturday 31 October 2026, the delays' last message at 09:21:52.430. Of its trips, 406 are
 * Estimated with a delay and not cancelled; the 950R to Hillerød St. runs 77 min late, then the
 * 144 22 min, the 123 and an IC 10 min each, and the 250S at 08:14 8 min. Read off the trips.
 */
const minute2 = saved('siri-et', '0002.json')

/**
 * The weekday recording's first minute, 07:20:00 on 16 June 2026: positions from Rejseplanen, its
 * delays theirs, with SIRI-ET's updates off. Every trip with a delay is Estimated on a computed
 * position seen at 07:20:00.
 */
const weekday = saved('weekday', '0001.json')

/** One of the weekday's Estimated S-trains, as the template for hand-made trips. */
const template = weekday.trips.find((trip) => trip.key === 's-tog.A.0bc307e3eb.20260616.0707')!

/** A hand-made trip on the weekday's minute, `delay` seconds late, seen at the snapshot's time. */
const trip = (key: string, delay: number, change: Partial<SnapshotTrip> = {}): SnapshotTrip => ({
  ...template,
  key,
  delay,
  ...change,
})

/** The weekday's minute with only `trips` on it. */
const withTrips = (...trips: SnapshotTrip[]): Snapshot => ({ ...weekday, trips })

const keysOf = (latest: Latest | undefined) =>
  latest?.kind === 'standout' ? latest.trips.map((ranked) => ranked.trip.key) : undefined

describe('Latest now', () => {
  it('names the trip furthest behind its timetable, then the next four', () => {
    const latest = latestOf(minute2, minute2.fetched)
    expect(latest?.kind).toBe('standout')
    expect(keysOf(latest)).toEqual([
      'train.950R.bacca19217.20261031.0733',
      'bus.144.bc5239a3e3.20261031.0815',
      // The 123 and the IC both run 10 min late: the trip key decides, the same each time.
      'bus.123.be52df473f.20261031.0830',
      'train.IC.4b951d7b67.20261031.0740',
      'bus.250S.0c7bd8e0e7.20261031.0814',
    ])
    expect(latest?.kind === 'standout' && latest.trips.map(({ delay }) => delay)).toEqual([
      4620, 1320, 600, 600, 480,
    ])
    // Drawn from every Estimated trip with a delay, early ones too, but not the cancelled ones.
    expect(latest?.kind === 'standout' && latest.count).toBe(406)
  })

  it('keeps the top five, counting every trip it was drawn from', () => {
    const latest = latestOf(
      withTrips(
        trip('a', 200),
        trip('b', 700),
        trip('c', 300),
        trip('d', 600),
        trip('e', 400),
        trip('f', 500),
        trip('g', 100),
        trip('h', -60),
      ),
      weekday.fetched,
    )
    expect(keysOf(latest)).toEqual(['b', 'd', 'f', 'e', 'c'])
    expect(latest?.kind === 'standout' && latest.count).toBe(8)
  })

  it('breaks a tie by the trip key, whatever order the snapshot lists them in', () => {
    expect(keysOf(latestOf(withTrips(trip('b', 300), trip('a', 300)), weekday.fetched))).toEqual([
      'a',
      'b',
    ])
    expect(keysOf(latestOf(withTrips(trip('a', 300), trip('b', 300)), weekday.fetched))).toEqual([
      'a',
      'b',
    ])
  })

  it('never names a cancelled trip, however late', () => {
    const latest = latestOf(
      withTrips(trip('cancelled', 1800, { cancelled: true }), trip('running', 300)),
      weekday.fetched,
    )
    expect(keysOf(latest)).toEqual(['running'])
    expect(latest?.kind === 'standout' && latest.count).toBe(1)
  })

  it('never ranks an early trip', () => {
    const latest = latestOf(
      withTrips(trip('late', 240), trip('early', -300), trip('on-time', 0)),
      weekday.fetched,
    )
    expect(keysOf(latest)).toEqual(['late'])
    expect(latest?.kind === 'standout' && latest.count).toBe(3)
  })

  it('is calm when no trip is 3 min or more late, with the largest delay', () => {
    expect(
      latestOf(withTrips(trip('a', 60), trip('b', 149), trip('c', -120)), weekday.fetched),
    ).toEqual({ kind: 'calm', delay: 149, count: 3 })
    // 150 s shows as "+3 min", the Delay component's late, so it stands out.
    expect(keysOf(latestOf(withTrips(trip('a', 60), trip('b', 150)), weekday.fetched))).toEqual([
      'b',
      'a',
    ])
  })

  it('is calm at 0 when every trip with a delay runs early or on time', () => {
    expect(latestOf(withTrips(trip('a', -60), trip('b', 0)), weekday.fetched)).toEqual({
      kind: 'calm',
      delay: 0,
      count: 2,
    })
  })

  it('counts only the trips whose state shows a delay now, by the clock', () => {
    // Seen 4 min before the snapshot, a computed position keeps the trip Estimated for 5 min
    // (docs/data-states.md), then it is No signal and its delay unknown: the next trip leads.
    const ageing = withTrips(
      trip('old', 900, { seen: weekday.fetched - 4 * MINUTE }),
      trip('new', 300),
    )
    expect(keysOf(latestOf(ageing, weekday.fetched))).toEqual(['old', 'new'])
    expect(keysOf(latestOf(ageing, weekday.fetched + 1.5 * MINUTE))).toEqual(['new'])
    // Six minutes on, every trip with a delay is No signal.
    expect(latestOf(weekday, weekday.fetched + 6 * MINUTE)).toEqual({ kind: 'none' })
  })

  it('leaves out a Timetable only trip, which carries no delay it shows', () => {
    const latest = latestOf(
      withTrips(
        trip('placed', 900, { state: 'timetable-only', seen: undefined, hadRealtime: false }),
        trip('a', 300),
      ),
      weekday.fetched,
    )
    expect(keysOf(latest)).toEqual(['a'])
  })

  it('says the feed is quiet once SIRI-ET has sent nothing for 5 min, naming no trip', () => {
    const lastMessage = minute2.updates.lastMessage!
    expect(latestOf(minute2, lastMessage + 5 * MINUTE)).toEqual({
      kind: 'quiet',
      since: lastMessage,
    })
    expect(latestOf(minute2, lastMessage + 5 * MINUTE - 1)?.kind).toBe('standout')
  })

  it('says the feed is quiet with no time when no message has come yet', () => {
    const { lastMessage: _, ...updates } = minute2.updates
    expect(latestOf({ ...minute2, updates }, minute2.fetched)).toEqual({ kind: 'quiet' })
  })

  it('is none when no trip on the map shows a delay, as when only the Metro runs', () => {
    const metro = minute2.trips.filter((each) => each.mode === 'metro')
    expect(metro.length).toBeGreaterThan(0)
    expect(latestOf({ ...minute2, trips: metro }, minute2.fetched)).toEqual({ kind: 'none' })
  })

  it('is nothing with the delays off', () => {
    // The timetable source without SIRI-ET: no trip carries a delay, and no feed is on.
    expect(latestOf(saved('timetable-source', '0006.json'), weekday.fetched)).toBeUndefined()
    // SIRI-ET's minute with the feed switched off and its delays gone, as `MYLDER_UPDATES` unset.
    const off: Snapshot = {
      ...minute2,
      updates: { kind: 'off', fresh: false, withUpdate: {}, unmatched: {} },
      trips: minute2.trips.map((each) => ({
        ...each,
        delay: undefined,
        steps: undefined,
        updated: undefined,
        state: 'timetable-only' as const,
      })),
    }
    expect(latestOf(off, minute2.fetched)).toBeUndefined()
  })

  it('is none, not nothing, on a source that can send delays when no trip has one', () => {
    // The `empty` recording: Rejseplanen's answers, every trip Timetable only, none with a delay,
    // and SIRI-ET off. Rejseplanen could send delays, so the pill says none shows one now.
    const empty = saved('empty', '0001.json')
    expect(empty.trips.some((each) => each.delay !== undefined)).toBe(false)
    expect(latestOf(empty, empty.fetched)).toEqual({ kind: 'none' })
    // The same on the simulation, and on SIRI-ET's feed with no trip updated yet.
    expect(latestOf({ ...empty, source: { kind: 'simulated' } }, empty.fetched)).toEqual({
      kind: 'none',
    })
    expect(latestOf({ ...minute2, trips: [] }, minute2.fetched)).toEqual({ kind: 'none' })
  })

  it('ranks the delays a source with positions brings, with SIRI-ET off', () => {
    // The weekday's S-train A at 07:07 runs 4 min late, the most of its 13 trips with a delay.
    const latest = latestOf(weekday, weekday.fetched)
    expect(keysOf(latest)?.[0]).toBe('s-tog.A.0bc307e3eb.20260616.0707')
    expect(latest?.kind === 'standout' && latest.count).toBe(13)
  })
})
