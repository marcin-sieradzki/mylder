import type { Mode } from '../timetable/format'

/**
 * Each mode's operator or authority, as City pulse's meters and the Latest right now panel name
 * it. The timetable doesn't name them yet, so they are the mode's, never a trip's.
 */
export const OPERATORS: Readonly<Record<Mode, string>> = {
  bus: 'Movia',
  metro: 'Metroselskabet',
  's-tog': 'DSB',
  train: 'DSB',
  'light-rail': 'Hovedstadens Letbane',
}
