'use client'

import { FilterChip, IconButton } from '@mylder/perron'
import { TopBar as PerronTopBar } from '@mylder/perron/patterns'
import { useRef, useState, type MouseEvent } from 'react'
import { useI18n } from '../i18n/useI18n'
import { useAircraftOff } from '../map/aircraft'
import { useAircraftCount } from '../map/aircraft-states'
import { useLastAnswer, useSnapshot } from '../map/live'
import { useOutOfDate, usePaused } from '../map/notices'
import { timezoneOf, useNetwork } from '../map/timetable'
import { mapView, useAircraftHidden, useHiddenModes } from '../map/view'
import { MODES, type Mode } from '../timetable/format'
import type { Network } from '../timetable/network'
import { clockTime } from '../timetable/time'
import type { Snapshot } from '../tracker/index'
import { aboutDialog } from './about'
import { LanguageSwitch } from './LanguageSwitch'
import { LatestNow } from './LatestNow'
import { useLatestPlace } from './latestPlace'
import { PerronIcon } from './PerronIcon'
import styles from './TopBar.module.css'
import { useLatest } from './useLatest'
import { usePhone } from './usePhone'

const openAbout = (event: MouseEvent<HTMLButtonElement>) => aboutDialog.open(event.currentTarget)

/** The modes the timetable runs, in Mylder's order: Bus, Metro, S-tog, Train, Light rail. */
const modesOf = (network: Network): Mode[] => {
  const run = new Set(network.patterns.lines.map((line) => line.mode))
  return MODES.filter((mode) => run.has(mode))
}

/** The trips underway in each mode: not cancelled, and not waiting at their first stop. */
function underwayByMode(snapshot: Snapshot | undefined): Map<Mode, number> {
  const counts = new Map<Mode, number>()
  for (const trip of snapshot?.trips ?? []) {
    if (trip.cancelled || trip.waiting) continue
    counts.set(trip.mode, (counts.get(trip.mode) ?? 0) + 1)
  }
  return counts
}

const showAircraft = (_event: Event, shown: boolean) => mapView.update({ aircraftHidden: !shown })

/**
 * The moving map's top bar (docs/screens.md, "The moving map"): Perron's TopBar with the brand,
 * the Updated line, the mode filters and the Planes filter, the Latest now pill, the language
 * switch and the About button, in the page's header. Its phone layout follows the window's width
 * in Perron's own CSS, from one render, so the prerendered page paints a phone its own bar first.
 * The pill sits in the tools while the bar keeps it on its one row, the start of its stop's name in
 * view (./latestPlace.ts), else on a row of its own under the bar, on glass of its own, as it
 * always does on a phone; it shows only once a snapshot has landed, so the prerendered page never
 * paints it in the wrong place.
 */
export function TopBar() {
  const { lang, dictionary } = useI18n()
  const snapshot = useSnapshot()
  const network = useNetwork(snapshot?.timetableVersion)
  const hidden = useHiddenModes()
  const aircraftHidden = useAircraftHidden()
  const aircraftCount = useAircraftCount()
  const aircraftOff = useAircraftOff()
  // The time the server received the latest position answer; while Paused it holds and says so.
  const updatedAt = useLastAnswer()
  const paused = usePaused()
  const outOfDate = useOutOfDate()
  const underway = underwayByMode(snapshot)
  const timezone = timezoneOf(network)
  const phone = usePhone()
  const latest = useLatest()
  const header = useRef<HTMLElement>(null)
  const identity = useRef<HTMLDivElement>(null)
  const filters = useRef<HTMLFieldSetElement>(null)
  const tools = useRef<HTMLDivElement>(null)
  const [pill, setPill] = useState<HTMLElement | null>(null)
  const placement = useLatestPlace({ header, identity, filters, tools, pill }, !phone)
  const inBar = !phone && placement.place === 'bar'
  // The Planes chip shows once the aircraft have answered, so a server with them off never names
  // them, or while the address hides them, to turn them on again. Off, the page no longer asks
  // for them, so the count it last had is left out.
  const planes =
    !aircraftOff && (aircraftCount !== undefined || aircraftHidden) ? (
      <FilterChip
        selected={!aircraftHidden}
        onChange={showAircraft}
        count={aircraftHidden ? undefined : aircraftCount}
      >
        {dictionary.topBar.aircraft}
      </FilterChip>
    ) : undefined

  const show = (mode: Mode, shown: boolean) => {
    const next = new Set(hidden)
    if (shown) next.delete(mode)
    else next.add(mode)
    mapView.update({ hidden: next })
  }

  return (
    <header ref={header} className={styles.header}>
      <PerronTopBar
        size="responsive"
        slotProps={{
          identity: { ref: identity },
          filters: { ref: filters },
          tools: { ref: tools },
        }}
        brandHref={`/${lang}`}
        time={
          updatedAt === undefined ? undefined : clockTime(updatedAt, timezone, { seconds: true })
        }
        // Mylder says a pause after the time, "Updated 07:20:00, paused", so it gives the whole
        // phrase in its own words rather than Perron's "Paused ·" before it.
        updatedLabel={dictionary.topBar[paused ? 'updatedPaused' : 'updated']}
        // Perron's own phrase, "Updated 07:20:00, may be out of date", in the page's language.
        outOfDate={outOfDate}
        // The group holds the Planes filter beside the modes, so it keeps Perron's own name,
        // "Filters".
        filters={
          network || planes ? (
            <>
              {network
                ? modesOf(network).map((mode) => (
                    <FilterChip
                      key={mode}
                      selected={!hidden.has(mode)}
                      onChange={(_event, shown) => show(mode, shown)}
                      count={underway.get(mode) ?? 0}
                    >
                      {dictionary.modes[mode]}
                    </FilterChip>
                  ))
                : undefined}
              {planes}
            </>
          ) : undefined
        }
        tools={
          <>
            {inBar ? (
              <LatestNow
                latest={latest}
                place="bar"
                {...(placement.place === 'bar' && placement.room !== undefined
                  ? { room: placement.room }
                  : {})}
                pillRef={setPill}
              />
            ) : null}
            <LanguageSwitch />
            <IconButton label={dictionary.topBar.about} size="large" onClick={openAbout}>
              <PerronIcon name="info" />
            </IconButton>
          </>
        }
      />
      {inBar ? null : (
        <LatestNow latest={latest} place={phone ? 'phone' : 'centred'} pillRef={setPill} />
      )}
    </header>
  )
}
