// Latest now (docs/screens.md, "Latest now"): the trip running furthest behind its timetable right
// now, anywhere on the map, among the trips whose delay is known, from the snapshot and the clock
// alone, as City pulse's figures are (./pulse.ts). Each trip's data state is worked out again by
// the clock, as the map's dots are, so a trip whose delay is no longer known drops out on the
// second it ages. Delays are in seconds.
import { feedFresh, type DataState } from '../domain/data-state'
import { delaysOn, describeSnapshotSource } from '../map/live'
import { statesAt } from '../map/states'
import { onMap } from '../map/vehicles'
import type { Mode } from '../timetable/format'
import type { Snapshot, SnapshotTrip } from '../tracker/index'
import { DELAY_KNOWN } from './delays'

/** A trip in the ranking, and how late it runs, in seconds. */
export interface RankedTrip {
  /** The snapshot's trip: its key, line, mode, headsign, next call and place on its pattern. */
  readonly trip: SnapshotTrip
  readonly delay: number
  /** Its data state now, by the clock: one that shows a delay. */
  readonly state: DataState
}

/**
 * What the pill says now:
 *
 * - `standout`: the latest trips, the top `TOP` largest first, and `count`, how many trips with a
 *   known delay they were drawn from, early and on-time ones too;
 * - `calm`: no trip `STANDS_OUT` late; the largest delay (0 when every trip runs early or on time)
 *   and the count;
 * - `quiet`: SIRI-ET's feed has sent nothing for 5 min, as the data cards judge it, since its last
 *   message, or with no time when none has come;
 * - `none`: no trip on the map shows a delay, as when only the Metro runs.
 */
export type Latest =
  | { readonly kind: 'standout'; readonly trips: readonly RankedTrip[]; readonly count: number }
  | { readonly kind: 'calm'; readonly delay: number; readonly count: number }
  | { readonly kind: 'quiet'; readonly since?: number }
  | { readonly kind: 'none' }

/** How many trips the ranking keeps. */
export const TOP = 5

/** A trip this late or later, in whole minutes, stands out: the Delay component's late. */
export const STANDS_OUT = 3

const NO_FILTER: ReadonlySet<Mode> = new Set()

/** A delay in whole minutes, as every screen shows it. */
export const wholeMinutes = (delay: number) => Math.round(delay / 60)

/** Largest delay first; a tie by trip key, so the order holds from one second to the next. */
const byDelay = (a: RankedTrip, b: RankedTrip) =>
  b.delay - a.delay || (a.trip.key < b.trip.key ? -1 : a.trip.key > b.trip.key ? 1 : 0)

/**
 * The pill's outcome for `snapshot` at `now`, on the server's clock; none with the delays off:
 * SIRI-ET's feed off on a source that can send none, the timetable alone. A source that can send
 * delays, Rejseplanen's answers, real, simulated or recorded, or SIRI-ET's feed, with no trip
 * showing one now, is `none`.
 */
export function latestOf(snapshot: Snapshot, now: number): Latest | undefined {
  const feedOn = delaysOn(snapshot)
  if (!feedOn && !describeSnapshotSource(snapshot).positions) return undefined
  const { lastMessage } = snapshot.updates
  // A quiet feed names no trip, so the pill never points at an old delay.
  if (feedOn && !feedFresh(lastMessage, now))
    return lastMessage === undefined ? { kind: 'quiet' } : { kind: 'quiet', since: lastMessage }

  const states = statesAt(snapshot, now)
  const known: RankedTrip[] = []
  for (const trip of snapshot.trips) {
    const state = states.get(trip.key) ?? trip.state
    if (!onMap(trip, NO_FILTER) || trip.delay === undefined || !DELAY_KNOWN.has(state)) continue
    known.push({ trip, delay: trip.delay, state })
  }
  if (known.length === 0) return { kind: 'none' }
  const late = known.filter(({ delay }) => delay > 0).sort(byDelay)
  const count = known.length
  if (late.length === 0 || wholeMinutes(late[0].delay) < STANDS_OUT)
    return { kind: 'calm', delay: late[0]?.delay ?? 0, count }
  return { kind: 'standout', trips: late.slice(0, TOP), count }
}
