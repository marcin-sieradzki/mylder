'use client'

import {
  Delay,
  EmptyState,
  FactList,
  LineBadge,
  Section,
  Surface,
  Text,
  VehicleDotLabel,
} from '@mylder/perron'
import { DetailPanel, SourceLine } from '@mylder/perron/patterns'
import { useEffect, useRef } from 'react'
import type { ClientDictionary } from '../i18n/dictionary'
import { useI18n } from '../i18n/useI18n'
import { delaysOn, useClockOffset, useSnapshot } from '../map/live'
import { spotlightLatest, spotlightTrip, useSpotlight, vehicleSpotlight } from '../map/spotlight'
import { useDataState } from '../map/states'
import { timezoneOf, useNetwork } from '../map/timetable'
import { onMap } from '../map/vehicles'
import { useHiddenModes } from '../map/view'
import { whereOf } from '../map/where'
import type { Network } from '../timetable/network'
import { clockTime } from '../timetable/time'
import type { Snapshot, SnapshotTrip } from '../tracker/index'
import type { PanelFrame } from './DetailPanels'
import { badgeLine } from './departureRow'
import { DELAY_KNOWN } from './delays'
import { wholeMinutes, type Latest, type RankedTrip } from './latest'
import { stopName } from './LatestNow'
import styles from './LatestPanel.module.css'
import { grouped } from './numbers'
import { OpenTrip } from './OpenTrip'
import { OPERATORS } from './operators'
import { useLatest } from './useLatest'
import { useServerSecond } from './useServerSecond'
import { VehicleActions } from './VehicleActions'
import { fill } from './vehicleLabel'

type Words = ClientDictionary['latestPanel']

/** How many trips the panel lists under the one it leads with, the top five in all. */
const LISTED = 4

export interface LatestPanelProps {
  /** Where the panel sits and how it closes, as every detail panel's. */
  frame: PanelFrame
}

/**
 * Latest right now (docs/screens.md, "Latest now"): the panel the Latest now pill opens, kept in
 * the address as `?latest=now`. It leads with the trip it picked, the one the spotlight rings,
 * with Follow and Show whole line as its vehicle panel has them, then lists the next latest, each
 * a tap from its own vehicle panel, the ring and a flight to it, and says what the ranking was
 * drawn from. With no trip 3 min late it lists the latest with none picked; with the delays quiet,
 * none known or off it says so and lists none. Opened from a link, it picks the trip running latest
 * as the page loads, as a press on the pill does.
 */
export function LatestPanel({ frame }: LatestPanelProps) {
  const { dictionary } = useI18n()
  const words = dictionary.latestPanel
  const snapshot = useSnapshot()
  const network = useNetwork(snapshot?.timetableVersion)
  const latest = useLatest()
  const picked = useSpotlight()
  usePickedOnLoad(latest)
  return (
    <DetailPanel {...frame} open variant="line" title={words.title}>
      {snapshot && network ? (
        <Body latest={latest} picked={picked} snapshot={snapshot} network={network} />
      ) : (
        <Text variant="body-sm" emphasis="secondary" render={<output />}>
          {words.loading}
        </Text>
      )}
    </DetailPanel>
  )
}

/**
 * Picks the trip running latest when the panel opens with none picked, as from a link: once, on
 * the first outcome the page has, so a panel the pill opened while calm never flies the map to a
 * trip that turns late later. The feed's first seconds, before any delay has come, are no outcome.
 */
function usePickedOnLoad(latest: Latest | undefined) {
  const decided = useRef(false)
  useEffect(() => {
    if (decided.current || !latest || (latest.kind === 'quiet' && latest.since === undefined))
      return
    decided.current = true
    if (vehicleSpotlight.get() === undefined && latest.kind === 'standout')
      spotlightLatest(latest.trips[0].trip.key)
  }, [latest])
}

interface BodyProps {
  latest: Latest | undefined
  /** The ringed trip, the one the panel leads with while the snapshot carries it. */
  picked: string | undefined
  snapshot: Snapshot
  network: Network
}

/** The picked trip, the list and the source line, or why there is none. */
function Body({ latest, picked, snapshot, network }: BodyProps) {
  const { dictionary } = useI18n()
  const words = dictionary.latestPanel
  if (!latest) return <EmptyState title={words.off}>{words.offDetail}</EmptyState>
  switch (latest.kind) {
    case 'quiet':
      return (
        <EmptyState
          title={
            latest.since === undefined
              ? dictionary.latest.quietNever
              : fill(dictionary.latest.quiet, {
                  time: clockTime(latest.since, timezoneOf(network)),
                })
          }
        >
          {words.quietDetail}
        </EmptyState>
      )
    case 'none':
      return <EmptyState title={words.none}>{words.noneDetail}</EmptyState>
    case 'calm':
    case 'standout': {
      const lead = picked === undefined ? undefined : leadOf(picked, snapshot, network)
      const listed = latest.trips
        .filter(({ trip }) => trip.key !== lead?.key)
        .slice(0, lead ? LISTED : LISTED + 1)
      const timezone = timezoneOf(network)
      // The delays' own time: SIRI-ET's last message, else the snapshot's that carried them.
      const updated =
        delaysOn(snapshot) && snapshot.updates.lastMessage !== undefined
          ? snapshot.updates.lastMessage
          : snapshot.fetched
      return (
        <>
          {lead ? <Lead trip={lead} snapshot={snapshot} network={network} /> : null}
          {latest.kind === 'calm' ? (
            <Text variant="body-sm">{latest.trips.length > 0 ? words.calm : words.calmNone}</Text>
          ) : null}
          {listed.length > 0 ? (
            <Section title={lead ? words.next : words.latestTrips}>
              <ul className={styles.list}>
                {listed.map((ranked) => (
                  <Row key={ranked.trip.key} ranked={ranked} network={network} words={words} />
                ))}
              </ul>
            </Section>
          ) : null}
          <SourceLine
            sources={[
              {
                label: fill(words.source, { count: grouped(latest.count) }),
                time: clockTime(updated, timezone, { seconds: true }),
              },
            ]}
          />
        </>
      )
    }
  }
}

/** The picked trip as the snapshot carries it, while its pattern is in the timetable shown. */
function leadOf(key: string, snapshot: Snapshot, network: Network): SnapshotTrip | undefined {
  const trip = snapshot.trips.find((each) => each.key === key)
  return trip && network.patterns.patterns[trip.pattern] ? trip : undefined
}

interface LeadProps {
  trip: SnapshotTrip
  snapshot: Snapshot
  network: Network
}

/**
 * The trip the panel leads with: its line badge and destination, its mode and operator, its delay
 * and where it is now, its next stop with the timetabled time struck before the expected one, its
 * data state as its vehicle panel shows it, when its delay was sent, and Follow and Show whole
 * line, as its vehicle panel offers them.
 */
function Lead({ trip, snapshot, network }: LeadProps) {
  const { dictionary } = useI18n()
  const words = dictionary.latestPanel
  const tripWords = dictionary.trip
  const now = useServerSecond(useClockOffset())
  const state = useDataState(trip.key) ?? trip.state
  const hidden = useHiddenModes()
  const timezone = timezoneOf(network)
  const pattern = network.patterns.patterns[trip.pattern]
  const line = badgeLine(network.patterns.lines[pattern.line]?.colour ?? '', trip.mode)
  const name = (index: number) => stopName(network, trip.pattern, index)
  const where = whereOf({
    trip,
    state,
    fetched: snapshot.fetched,
    path: network.pathOf(trip.pattern),
    calls: [],
    now,
  })
  const place =
    where.kind === 'between'
      ? fill(tripWords.between, { from: name(where.from), to: name(where.to) })
      : where.kind === 'waiting'
        ? fill(words.waiting, { stop: name(where.stop) })
        : fill(where.kind === 'near' ? tripWords.near : tripWords.at, { stop: name(where.stop) })
  const known = DELAY_KNOWN.has(state) && trip.delay !== undefined
  const next = trip.next[0]
  const sent = trip.updated ?? trip.seen
  return (
    <Surface
      variant="raised"
      className={styles.lead}
      render={<section aria-label={words.picked} />}
    >
      <div className={styles.named}>
        <LineBadge line={line}>{trip.line}</LineBadge>
        <Text variant="heading-sm" render={<h3 />} className={styles.headsign}>
          {fill(tripWords.to, { headsign: trip.headsign })}
        </Text>
      </div>
      <Text variant="body-sm" emphasis="secondary">
        {fill(words.modeOperator, {
          mode: dictionary.modes[trip.mode],
          operator: OPERATORS[trip.mode],
        })}
      </Text>
      <div className={styles.where}>
        <Delay minutes={known ? trip.delay! / 60 : null} />
        <Text variant="body-sm">{place}</Text>
      </div>
      <FactList
        aria-label={tripWords.facts}
        items={[
          {
            label: tripWords.nextStop,
            value:
              next === undefined ? undefined : (
                <NextStop
                  stop={name(next.index)}
                  expected={next.time}
                  delay={known ? trip.delay : undefined}
                  estimated={state === 'estimated'}
                  timezone={timezone}
                  words={words}
                />
              ),
          },
        ]}
      />
      <VehicleDotLabel variant={state} line={line} />
      {sent === undefined ? null : (
        <Text variant="caption" emphasis="secondary">
          {fill(words.sent, { time: clockTime(sent, timezone) })}
        </Text>
      )}
      <div className={styles.actions}>
        <VehicleActions
          tripKey={trip.key}
          pattern={trip.pattern}
          onMap={onMap(trip, hidden)}
          network={network}
        />
      </div>
    </Surface>
  )
}

interface NextStopProps {
  stop: string
  /** When the trip is expected there, by its delay. */
  expected: number
  /** Its delay there, in seconds, while known. */
  delay: number | undefined
  /** Whether the expected time is an estimate, marked "~" as the trip's stops mark it. */
  estimated: boolean
  timezone: string
  words: Words
}

/** The struck timetabled time shows from a minute's difference, as on a departure row. */
const STRIKE_FROM = 60_000

/**
 * The next stop, its timetabled time struck through before the time the delay gives, "Hillerød St.
 * 08:06 ~09:23", heard "Hillerød St., Timetabled 08:06, expected 09:23"; with no delay known, the
 * time alone. A stand-in for Perron's struck timetabled time outside a departure row, as
 * DepartureRow draws its own, until Perron has one. perron-stand-in: perron#TBD
 */
function NextStop({ stop, expected, delay, estimated, timezone, words }: NextStopProps) {
  const at = (moment: number) => clockTime(moment, timezone)
  if (delay === undefined) return `${stop} ${at(expected)}`
  const timetabled = expected - delay * 1000
  const struck = Math.abs(expected - timetabled) >= STRIKE_FROM
  const mark = estimated ? '~' : ''
  return (
    <span className={styles.next}>
      {stop}{' '}
      {struck ? (
        <>
          <span className={styles.heard}>
            {fill(words.timetabled, { time: at(timetabled) })},{' '}
            {fill(words.expected, { time: at(expected) })}
          </span>
          <span aria-hidden="true">
            <s>{at(timetabled)}</s> {mark}
            {at(expected)}
          </span>
        </>
      ) : (
        at(expected)
      )}
    </span>
  )
}

interface RowProps {
  ranked: RankedTrip
  network: Network
  words: Words
}

/**
 * One of the next latest: its line badge, destination, next stop and delay, a tap away from its
 * vehicle panel, the ring and a flight to its dot.
 */
function Row({ ranked, network, words }: RowProps) {
  const { trip, delay } = ranked
  const pattern = network.patterns.patterns[trip.pattern]
  const colour = (pattern && network.patterns.lines[pattern.line]?.colour) ?? ''
  const next = trip.next[0]
  const stop = next && pattern ? stopName(network, trip.pattern, next.index) : '—'
  return (
    <li className={styles.row}>
      <OpenTrip
        departure={{ trip: trip.key, mode: trip.mode, line: trip.line, headsign: trip.headsign }}
        label={fill(words.row, {
          line: trip.line,
          headsign: trip.headsign,
          minutes: wholeMinutes(delay),
          stop,
        })}
        onOpen={spotlightTrip}
      />
      <LineBadge line={badgeLine(colour, trip.mode)}>{trip.line}</LineBadge>
      <span className={styles.rowWords}>
        <Text variant="body-sm" render={<span />}>
          {trip.headsign}
        </Text>
        <Text variant="caption" emphasis="secondary" render={<span />}>
          {fill(words.rowNext, { stop })}
        </Text>
      </span>
      <Delay minutes={delay / 60} />
    </li>
  )
}
