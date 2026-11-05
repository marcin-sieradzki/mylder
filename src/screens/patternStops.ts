import type { Network } from '../timetable/network'

/** A stop of the trip's pattern by its index there, by its platform's name, as its calls name it. */
export const stopName = (network: Network, pattern: number, index: number): string =>
  network.stops.platforms[network.patterns.patterns[pattern].stops[index]]?.name ?? ''
