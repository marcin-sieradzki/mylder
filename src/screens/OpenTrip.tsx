'use client'

import { useI18n } from '../i18n/useI18n'
import { openPanel } from '../map/view'
import type { StopDeparture } from '../tracker/index'
import styles from './OpenTrip.module.css'
import { fill } from './vehicleLabel'

export interface OpenTripProps {
  /** The departure or arrival whose trip the button opens; an arrival names where it comes from. */
  departure: Pick<StopDeparture, 'trip' | 'mode' | 'line' | 'headsign'> & {
    readonly origin?: string
  }
  /** The button's name, where the row says more than its trip, such as its delay. */
  label?: string
  /** Opens the trip, by its key; its panel in the address unless given. */
  onOpen?: (key: string) => void
}

const openTrip = (key: string) => openPanel({ kind: 'trip', id: key })

/**
 * Makes a departure or arrival row open its trip's detail (docs/screens.md, "Vehicle detail"): a
 * button over the whole row, named for the trip as the row reads, "S-tog E to Køge St." for a
 * departure and "S-tog E from Holte St." for an arrival, or as `label` says. Put it in the row's
 * list item, which it stretches over.
 */
export function OpenTrip({ departure, label, onOpen = openTrip }: OpenTripProps) {
  const { dictionary } = useI18n()
  const { mode, line, headsign, origin } = departure
  const name =
    label ??
    (origin === undefined
      ? fill(dictionary.vehicle.title, { mode: dictionary.modes[mode], line, headsign })
      : fill(dictionary.vehicle.titleFrom, { mode: dictionary.modes[mode], line, origin }))
  return (
    <button
      type="button"
      className={styles.open}
      aria-label={name}
      onClick={() => onOpen(departure.trip)}
    />
  )
}
