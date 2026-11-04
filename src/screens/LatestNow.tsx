'use client'

import { Button, Delay, LineBadge, Surface, Text } from '@mylder/perron'
import { useSyncExternalStore, type ReactNode } from 'react'
import type { ClientDictionary } from '../i18n/dictionary'
import { useI18n } from '../i18n/useI18n'
import { liveSnapshot, useSnapshot, type LiveSnapshot } from '../map/live'
import { tickingStore } from '../map/ticking'
import { timezoneOf, useNetwork } from '../map/timetable'
import { openPanel } from '../map/view'
import { whereOf, type Where } from '../map/where'
import type { Network } from '../timetable/network'
import { clockTime } from '../timetable/time'
import type { Snapshot } from '../tracker/index'
import { badgeLine } from './departureRow'
import { latestOf, wholeMinutes, type Latest, type RankedTrip } from './latest'
import styles from './LatestNow.module.css'
import { fill } from './vehicleLabel'

type Words = ClientDictionary['latest']

/** Whether two outcomes say the same: the same trips of the same snapshot, the same figures. */
function sameLatest(a: Latest | undefined, b: Latest | undefined): boolean {
  if (a === b) return true
  if (!a || !b || a.kind !== b.kind) return false
  switch (a.kind) {
    case 'standout': {
      const other = b as typeof a
      return (
        a.count === other.count &&
        a.trips.length === other.trips.length &&
        a.trips.every((each, i) => each.trip === other.trips[i].trip)
      )
    }
    case 'calm': {
      const other = b as typeof a
      return a.delay === other.delay && a.count === other.count
    }
    case 'quiet':
      return a.since === (b as typeof a).since
    case 'none':
      return true
  }
}

/**
 * The page's outcome, by the server's clock: it moves on when a snapshot lands, and on the second a
 * trip's delay is no longer known or the feed goes quiet.
 */
const latestNow = tickingStore(
  ({ snapshot }: LiveSnapshot, now: number) => snapshot && latestOf(snapshot, now),
  sameLatest,
  liveSnapshot,
)

const useLatest = (): Latest | undefined =>
  useSyncExternalStore(latestNow.subscribe, latestNow.get, () => undefined)

/**
 * Where the trip was when the snapshot placed it, as its panel says it: at a stop, or between the
 * stop it last passed and its next; a Waiting trip is at its first stop.
 */
function whereAt({ trip, state }: RankedTrip, snapshot: Snapshot, network: Network): Where {
  return whereOf({
    trip,
    state,
    fetched: snapshot.fetched,
    path: network.pathOf(trip.pattern),
    calls: [],
    now: snapshot.fetched,
  })
}

/** A stop of the trip's pattern by its index there, by its platform's name, as its calls name it. */
const stopName = (network: Network, pattern: number, index: number) =>
  network.stops.platforms[network.patterns.patterns[pattern].stops[index]]?.name ?? ''

/** A delay as the pill writes it, "+2 min", in whole minutes. */
const signed = (delay: number, words: Words) => {
  const minutes = wholeMinutes(delay)
  return `${minutes > 0 ? '+' : ''}${fill(words.minutes, { minutes })}`
}

interface StandoutProps {
  ranked: RankedTrip
  snapshot: Snapshot
  network: Network
  words: Words
}

/**
 * The latest trip, "Latest now [5C] +11 min at Nørrebros Runddel", the stop it is at or last
 * passed, heard with the stops it is between; a press opens its vehicle panel, as a tap on its
 * dot does.
 */
function Standout({ ranked, snapshot, network, words }: StandoutProps) {
  const { trip, delay } = ranked
  const pattern = network.patterns.patterns[trip.pattern]
  const where = whereAt(ranked, snapshot, network)
  const name = (index: number) => stopName(network, trip.pattern, index)
  const shown = where.kind === 'between' ? where.from : where.kind === 'waiting' ? 0 : where.stop
  const heard =
    where.kind === 'between'
      ? fill(words.labelBetween, { from: name(where.from), to: name(where.to) })
      : fill(words.labelAt, { stop: name(shown) })
  const colour = network.patterns.lines[pattern.line]?.colour ?? ''
  return (
    <Button
      variant="outline"
      size="small"
      className={styles.pill}
      aria-label={fill(words.label, {
        line: trip.line,
        headsign: trip.headsign,
        minutes: wholeMinutes(delay),
        where: heard,
      })}
      onClick={() => openPanel({ kind: 'trip', id: trip.key })}
    >
      <span className={styles.content}>
        <span>{words.now}</span>
        <LineBadge line={badgeLine(colour, trip.mode)}>{trip.line}</LineBadge>
        <Delay minutes={delay / 60} />
        <span className={styles.where}>{fill(words.at, { stop: name(shown) })}</span>
      </span>
    </Button>
  )
}

/**
 * The Latest now pill (docs/screens.md, "Latest now"): the trip furthest behind its timetable right
 * now, or, naming no trip, that none is 3 min late, that the delays have stopped coming, or that
 * no trip on the map sends them. None with the delays off, or before the timetable has loaded.
 * In the top bar's tools, or with `phone`, alone on a glass row of its own under the bar.
 */
export function LatestNow({ phone = false }: { phone?: boolean }) {
  const { dictionary } = useI18n()
  const words = dictionary.latest
  const latest = useLatest()
  const snapshot = useSnapshot()
  const network = useNetwork(snapshot?.timetableVersion)
  if (!latest || !snapshot || !network) return null
  // The timetable before the snapshot's, still shown while it loads, may lack the trip's pattern.
  if (latest.kind === 'standout' && !network.patterns.patterns[latest.trips[0].trip.pattern])
    return null
  const pill = pillOf(latest, snapshot, network, words)
  return phone ? (
    <Surface variant="glass" className={styles.row}>
      {pill}
    </Surface>
  ) : (
    pill
  )
}

/** The pill for each outcome. */
function pillOf(latest: Latest, snapshot: Snapshot, network: Network, words: Words): ReactNode {
  switch (latest.kind) {
    case 'standout':
      return (
        <Standout ranked={latest.trips[0]} snapshot={snapshot} network={network} words={words} />
      )
    case 'calm':
      return (
        <Text variant="label" render={<p />} className={styles.line}>
          {`${words.now} ${fill(words.atMost, { delay: signed(latest.delay, words) })}`}
        </Text>
      )
    case 'quiet':
      return (
        <Text variant="label" render={<p />} className={styles.line}>
          {latest.since === undefined
            ? words.quietNever
            : fill(words.quiet, { time: clockTime(latest.since, timezoneOf(network)) })}
        </Text>
      )
    case 'none':
      return (
        <Text variant="label" render={<p />} className={styles.line}>
          {words.now} <Delay minutes={null} /> · {words.noDelays}
        </Text>
      )
  }
}
