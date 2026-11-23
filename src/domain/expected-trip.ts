// A trip's expected calls (GLOSSARY.md, "Expected trip"): its planned calls timed by what is known
// of it, which calls it won't serve, its next call and the Delay there. The tracker's map, a stop's
// rows, the trips standing at a stop, a trip's detail and its panel in the browser all read a trip
// through this one module, so they agree on its times and on which call is next. Times are
// milliseconds since the epoch; a delay is in seconds, as the snapshot carries it.
import type { Call, TimedCall } from './trip-motion.ts'

/**
 * One of a trip's delay steps (GLOSSARY.md, "Delay step"; spec #146): the index of a call its
 * update gave an expected time, and its delay there in seconds, late at its departure, or at its
 * arrival at the last stop. It holds for every call after it until the next step.
 */
export type DelayStep = readonly [index: number, delay: number]

/** What is known of a trip beside its planned calls. */
export interface Known {
  /** Its update's delay steps, which time its calls alone when it has any. */
  readonly steps?: readonly DelayStep[]
  /**
   * Its Delay in seconds, the snapshot's or the history's: without steps, every call is shifted by
   * it, and the calls before an answer's first expected time run late by it.
   */
  readonly delay?: number
  /** Called off whole: it serves none of its calls. */
  readonly cancelled?: boolean
  /** The indexes of the calls it won't serve. */
  readonly cancelledCalls?: readonly number[]
}

/** A call ahead of a trip: its index, and its expected departure, or arrival at the last stop. */
export interface NextCallTime {
  readonly index: number
  readonly time: number
}

/** A trip's calls as Mylder expects them, for any moment. */
export interface ExpectedTrip {
  /**
   * Each call's times as the trip will keep them: expected where anything known gives them, in the
   * gaps the planned ones plus the latest delay before them, and never running back before the one
   * before; the plan's when nothing is known.
   */
  readonly times: readonly TimedCall[]
  /** Whether anything known times its calls; false when `times` are the plan's. */
  readonly expected: boolean
  /** Called off whole. */
  readonly cancelled: boolean
  /**
   * The Delay it keeps for the rest of its day, in seconds: at its latest call with an expected
   * time, else the Delay it was given; none when nothing is known.
   */
  readonly latestDelay: number | undefined
  /** Whether it won't serve the call at `index`: the call, or the whole trip, is cancelled. */
  skips(index: number): boolean
  /**
   * The calls still ahead of it at `now`, in order, served or not: each whose expected departure,
   * or arrival at the last stop, is after `now`, with that time. Its path's timeline runs through
   * them, as the vehicle passes a cancelled call's stop on its way.
   */
  ahead(now: number): NextCallTime[]
  /**
   * Its next call at `now` (GLOSSARY.md, "Next call"): the first call ahead that it serves; none
   * once it has made its last, and none for a trip cancelled whole.
   */
  nextCall(now: number): number | undefined
  /**
   * Seconds behind its plan at the call at `index`, negative when early: at the departure, or the
   * arrival at the last stop; none when nothing is known.
   */
  delayAt(index: number | undefined): number | undefined
  /** Its Delay at `now`: at its next call, else its `latestDelay`. */
  delayAtNext(now: number): number | undefined
}

/**
 * A trip's expected calls, from its `calls`, planned and with the expected times an answer gave
 * them, and what else is `known` of it.
 */
export function expectedTrip(calls: readonly Call[], known: Known = {}): ExpectedTrip {
  const { steps, delay, cancelled = false, cancelledCalls = [] } = known
  const last = calls.length - 1
  let timed: { readonly times: readonly TimedCall[]; readonly latest?: number } | undefined
  const timing = () => (timed ??= timesOf(calls, steps, delay))
  const skips = (index: number) => cancelled || cancelledCalls.includes(index)
  const shownAt = (times: readonly TimedCall[], index: number) =>
    index === last ? times[index].arrival : times[index].departure
  const trip: ExpectedTrip = {
    get times() {
      return timing().times
    },
    get expected() {
      return timing().latest !== undefined
    },
    cancelled,
    get latestDelay() {
      return timing().latest
    },
    skips,
    ahead(now) {
      const { times } = timing()
      const ahead: NextCallTime[] = []
      times.forEach((_, index) => {
        const time = shownAt(times, index)
        if (time > now) ahead.push({ index, time })
      })
      return ahead
    },
    nextCall(now) {
      const { times } = timing()
      for (let index = 0; index <= last; index++) {
        if (shownAt(times, index) > now && !skips(index)) return index
      }
      return undefined
    },
    delayAt(index) {
      if (index === undefined || !calls[index] || !trip.expected) return undefined
      return (shownAt(timing().times, index) - shownAt(calls, index)) / 1000
    },
    delayAtNext(now) {
      return trip.delayAt(trip.nextCall(now)) ?? trip.latestDelay
    },
  }
  return trip
}

/** A call's delay by its own expected time, in milliseconds: at its departure, else its arrival. */
function ownDelay(call: Call): number | undefined {
  if (call.expectedDeparture !== undefined) return call.expectedDeparture - call.departure
  if (call.expectedArrival !== undefined) return call.expectedArrival - call.arrival
  return undefined
}

/**
 * The calls with the expected times their steps give, where an answer gave the call none: each
 * step's call leaves that late, and arrives so at the last stop.
 */
function stepped(calls: readonly Call[], steps: readonly DelayStep[]): Call[] {
  const last = calls.length - 1
  const out = [...calls]
  for (const [index, late] of steps) {
    const call = out[index]
    if (!call) continue
    out[index] = {
      ...call,
      expectedDeparture: call.expectedDeparture ?? call.departure + late * 1000,
      ...(index === last
        ? { expectedArrival: call.expectedArrival ?? call.arrival + late * 1000 }
        : {}),
    }
  }
  return out
}

/**
 * The times a trip keeps, and its latest delay in seconds; none for a trip nothing known times.
 * With steps, the steps and an answer's times alone time it, the calls before the first expected
 * time running late by that one. Without, the calls before an answer's first expected time run
 * late by the Delay, else by that first one.
 */
function timesOf(
  calls: readonly Call[],
  steps: readonly DelayStep[] | undefined,
  delay: number | undefined,
): { readonly times: readonly TimedCall[]; readonly latest?: number } {
  const byStep = steps !== undefined && steps.length > 0
  const merged = byStep ? stepped(calls, steps) : calls
  const delays = merged.map(ownDelay)
  const firstKnown = delays.find((each) => each !== undefined)
  const latestKnown = delays.findLast((each) => each !== undefined)
  const latest = latestKnown !== undefined ? latestKnown / 1000 : delay
  let carried = !byStep && delay !== undefined ? delay * 1000 : (firstKnown ?? 0)
  let previous = -Infinity
  const atLeastPrevious = (time: number) => (previous = Math.max(previous, time))
  const times = merged.map((call, i) => {
    const arrival = atLeastPrevious(call.expectedArrival ?? call.arrival + carried)
    carried = delays[i] ?? carried
    const departure = atLeastPrevious(call.expectedDeparture ?? call.departure + carried)
    return { arrival, departure }
  })
  return latest === undefined ? { times } : { times, latest }
}
