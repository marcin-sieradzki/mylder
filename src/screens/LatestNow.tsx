'use client'

import { Button, Delay, LineBadge, Surface, Text } from '@mylder/perron'
import type { CSSProperties, ReactNode, Ref } from 'react'
import type { ClientDictionary } from '../i18n/dictionary'
import { useI18n } from '../i18n/useI18n'
import { useSnapshot } from '../map/live'
import { timezoneOf, useNetwork } from '../map/timetable'
import { openPanel } from '../map/view'
import { whereOf, type Where } from '../map/where'
import type { Network } from '../timetable/network'
import { clockTime } from '../timetable/time'
import type { Snapshot } from '../tracker/index'
import { badgeLine } from './departureRow'
import { wholeMinutes, type Latest, type RankedTrip } from './latest'
import styles from './LatestNow.module.css'
import { fill } from './vehicleLabel'

type Words = ClientDictionary['latest']

/** Where the pill sits: in the top bar's tools, or on a row under the bar, a phone's or centred. */
export type LatestPlace = 'bar' | 'phone' | 'centred'

/** How the pill is laid out and reached: what the top bar measures it by (./latestPlace.ts). */
interface PillProps {
  /** The pill's widest, in px, in the bar's tools; none to take its words' width. */
  readonly room?: number
  /** The pill's own element, the button or the line of words, for the top bar to measure. */
  readonly pillRef?: Ref<HTMLElement>
}

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

interface StandoutProps extends PillProps {
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
function Standout({ ranked, snapshot, network, words, room, pillRef }: StandoutProps) {
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
  const [before, after] = words.at.split('{stop}')
  return (
    <Button
      ref={pillRef as Ref<HTMLButtonElement>}
      variant="outline"
      size="small"
      className={styles.pill}
      style={roomStyle(room)}
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
        <span className={styles.where} data-latest-where="">
          {before}
          <span data-latest-stop="">{name(shown)}</span>
          {after}
        </span>
      </span>
    </Button>
  )
}

/** The pill's room as the style its CSS reads it by; none leaves it its words' width. */
const roomStyle = (room: number | undefined): CSSProperties | undefined =>
  room === undefined ? undefined : ({ '--latest-room': `${room}px` } as CSSProperties)

export interface LatestNowProps extends PillProps {
  /** The page's outcome now (./useLatest.ts); none with the delays off. */
  readonly latest: Latest | undefined
  readonly place: LatestPlace
}

/**
 * The Latest now pill (docs/screens.md, "Latest now"): the trip furthest behind its timetable right
 * now, or, naming no trip, that none is 3 min late, that the delays have stopped coming, or that
 * no trip on the map sends them. None with the delays off, or before the timetable has loaded.
 * In the top bar's tools, or alone on a glass row of its own under the bar: at the start on a
 * phone, centred on a wider screen; the top bar chooses (./latestPlace.ts).
 */
export function LatestNow({ latest, place, room, pillRef }: LatestNowProps) {
  const { dictionary } = useI18n()
  const words = dictionary.latest
  const snapshot = useSnapshot()
  const network = useNetwork(snapshot?.timetableVersion)
  if (!latest || !snapshot || !network) return null
  // The timetable before the snapshot's, still shown while it loads, may lack the trip's pattern.
  if (latest.kind === 'standout' && !network.patterns.patterns[latest.trips[0].trip.pattern])
    return null
  const pill = pillOf(latest, snapshot, network, words, { room, pillRef })
  return place === 'bar' ? (
    pill
  ) : (
    <Surface variant="glass" className={styles.row} data-place={place}>
      {pill}
    </Surface>
  )
}

/** The pill for each outcome. */
function pillOf(
  latest: Latest,
  snapshot: Snapshot,
  network: Network,
  words: Words,
  { room, pillRef }: PillProps,
): ReactNode {
  const line = (children: ReactNode) => (
    <Text
      ref={pillRef as Ref<HTMLParagraphElement>}
      variant="label"
      render={<p />}
      className={styles.line}
      style={roomStyle(room)}
    >
      {children}
    </Text>
  )
  switch (latest.kind) {
    case 'standout':
      return (
        <Standout
          ranked={latest.trips[0]}
          snapshot={snapshot}
          network={network}
          words={words}
          room={room}
          pillRef={pillRef}
        />
      )
    case 'calm':
      return line(`${words.now} ${fill(words.atMost, { delay: signed(latest.delay, words) })}`)
    case 'quiet':
      return line(
        latest.since === undefined
          ? words.quietNever
          : fill(words.quiet, { time: clockTime(latest.since, timezoneOf(network)) }),
      )
    case 'none':
      return line(
        <>
          {words.now} <Delay minutes={null} /> · {words.noDelays}
        </>,
      )
  }
}
