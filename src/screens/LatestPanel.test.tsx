import '@mylder/perron/tokens.css'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import da from '../i18n/da.json'
import en from '../i18n/en.json'
import type { Lang } from '../i18n/lang'
import { followedVehicle } from '../map/follow'
import { mapHighlight, PHONE_QUERY } from '../map/highlight'
import { liveSnapshot } from '../map/live'
import { vehicleFlight, vehicleSpotlight } from '../map/spotlight'
import { mapView, openPanel } from '../map/view'
import { timetableRoutesOf } from '../test/timetableRoutes'
import type { Snapshot, SnapshotTrip } from '../tracker/index'
import { MapScreen } from './MapScreen'
import { Providers } from './Providers'

// The Latest right now panel (docs/screens.md, "Latest now"; spec #237, #240), on the timetable
// source with `MYLDER_UPDATES=recording:siri-et`, saved in recordings/siri-et: its second minute,
// 09:22:00 in Copenhagen on Saturday 31 October 2026, the delays' last message at 09:21:52. The
// latest five, read off the snapshot's trips, their next calls and their patterns' stops in the
// recording's timetable: the 950R to Hillerød, 77 min late between Slotspavillonen St. and
// Hillerød St., its last stop and next, timetabled 08:06 and expected 09:23, its delay sent at
// 09:15:07; the 144 to Vallensbæk St., 22 min late; the 123 to Roskilde St. and the IC to Østerport
// St., 10 min each; and the 250S to Dragør Stationsplads, 8 min. 406 trips have a known delay.
const folder = join(process.cwd(), 'recordings', 'siri-et')
const minute2 = JSON.parse(readFileSync(join(folder, 'snapshots', '0002.json'), 'utf8')) as Snapshot
const LATEST = 'train.950R.bacca19217.20261031.0733'
const SECOND = 'bus.144.bc5239a3e3.20261031.0815'

/** The minute with every delay `delay` seconds or less, as a calm network runs. */
const calm = (delay: number): Snapshot => ({
  ...minute2,
  trips: minute2.trips.map((trip) =>
    trip.delay === undefined ? trip : { ...trip, delay: Math.min(trip.delay, delay) },
  ),
})

/** Whether the page is as narrow as a phone, as each test sets it. */
let phone = false
const mediaLists = new Map<string, object>()
/** The browser's `matchMedia`, which jsdom lacks: only the phone's query matches, with `phone`. */
function matchMedia(query: string) {
  let list = mediaLists.get(query)
  if (!list) {
    list = {
      get matches() {
        return query === PHONE_QUERY && phone
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    }
    mediaLists.set(query, list)
  }
  return list
}

/** The trip route never answers here, so an opened trip's panel stays on its way. */
const routes = (input: RequestInfo | URL): Promise<Response> =>
  String(input).startsWith('/api/trips/')
    ? new Promise(() => {})
    : timetableRoutesOf('siri-et')(input)

/** The flights the map is asked for, by their trips' keys, from now on. */
let flown: string[] = []
let stopHearing = () => {}

/** Opens the map in `lang` on `snapshot` at the address's `query`, the clock at its fetch. */
async function open(lang: Lang, snapshot: Snapshot = minute2, query = '') {
  vi.setSystemTime(snapshot.fetched)
  act(() => liveSnapshot.update({ snapshot, clockOffset: 0 }))
  window.history.replaceState(null, '', `/${lang}${query}`)
  render(
    <Providers lang={lang} dictionary={lang === 'da' ? da : en}>
      <MapScreen />
    </Providers>,
  )
  // The pill and the panel wait for the timetable, which names the stops and colours the badges.
  await screen.findByRole('group', { name: lang === 'da' ? 'Filtre' : 'Filters' })
}

/** Presses the pill, as the rider does, and gives the panel it opens. */
async function press(name: RegExp, title = 'Latest right now') {
  fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name }))
  return screen.findByRole('dialog', { name: title })
}

const query = () => new URLSearchParams(window.location.search)

/** The value of the fact named `label` in `within_`. */
const fact = (within_: HTMLElement, label: string) =>
  within(within_).getByText(label, { selector: 'dt' }).nextElementSibling as HTMLElement

beforeEach(() => {
  phone = false
  vi.stubGlobal('matchMedia', matchMedia)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.stubGlobal('fetch', routes)
  flown = []
  stopHearing = vehicleFlight.subscribe((key) => flown.push(key))
})

afterEach(() => {
  stopHearing()
  act(() => {
    vehicleSpotlight.clear()
    followedVehicle.stop()
    mapHighlight.clear()
    openPanel(undefined)
  })
  act(() => liveSnapshot.update({ snapshot: undefined, clockOffset: 0 }))
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('the Latest right now panel', () => {
  it("leads with the latest trip's line, destination, delay, place, next stop, state and sending", async () => {
    await open('en')
    const panel = await press(/^Biggest delay right now:/)
    const lead = within(panel).getByRole('region', { name: 'The latest trip' })
    expect(within(lead).getByText('950R')).toHaveAttribute('data-line', 'regional')
    expect(within(lead).getByRole('heading', { name: 'to Hillerød' })).toBeInTheDocument()
    expect(within(lead).getByText('Train · DSB')).toBeInTheDocument()
    const delay = lead.querySelector('.pn-Delay')!
    expect(delay).toHaveAttribute('data-delay', 'late')
    expect(delay).toHaveTextContent(/^\+77 min/)
    expect(
      within(lead).getByText('Between Slotspavillonen St. and Hillerød St.'),
    ).toBeInTheDocument()
    // Hillerød St., timetabled 08:06 and struck through, expected about 09:23.
    const next = fact(lead, 'Next stop')
    expect(next).toHaveTextContent(/^Hillerød St\. Timetabled 08:06, expected 09:2308:06 ~09:23$/)
    expect(next.querySelector('s')).toHaveTextContent(/^08:06$/)
    // Seen, the times alone; heard, what each is.
    expect(next.querySelector('[aria-hidden="true"]')).toHaveTextContent(/^08:06 ~09:23$/)
    // The vehicle panel's ring and word for an Estimated trip.
    expect(lead.querySelector('.pn-VehicleDotLabel')).toHaveTextContent('Estimated')
    expect(within(lead).getByText('Delay sent 09:15, by Rejseplanen')).toBeInTheDocument()
  })

  it('says it all in Danish', async () => {
    await open('da')
    const panel = await press(/^Største forsinkelse lige nu:/, 'Mest forsinket lige nu')
    const lead = within(panel).getByRole('region', { name: 'Den mest forsinkede tur' })
    expect(within(lead).getByRole('heading', { name: 'mod Hillerød' })).toBeInTheDocument()
    expect(within(lead).getByText('Tog · DSB')).toBeInTheDocument()
    expect(within(lead).getByText('Mellem Slotspavillonen St. og Hillerød St.')).toBeInTheDocument()
    expect(fact(lead, 'Næste stop')).toHaveTextContent(
      /^Hillerød St\. Planlagt 08:06, forventet 09:23/,
    )
    expect(lead.querySelector('.pn-VehicleDotLabel')).toHaveTextContent('Beregnet')
    expect(within(lead).getByText('Forsinkelse sendt 09:15 af Rejseplanen')).toBeInTheDocument()
    expect(within(lead).getByRole('button', { name: 'Følg' })).toBeInTheDocument()
    expect(within(lead).getByRole('button', { name: 'Vis hele linjen' })).toBeInTheDocument()
    const list = within(panel).getByRole('region', { name: 'Næste mest forsinkede' })
    expect(
      within(list)
        .getAllByRole('button')
        .map((row) => row.getAttribute('aria-label')),
    ).toEqual([
      '144 mod Vallensbæk St., 22 min forsinket, næste stop Lundbækvej (Vejlegårdsvej)',
      '123 mod Roskilde St., 10 min forsinket, næste stop Kong Valdemars Vej (Algade)',
      'IC mod Østerport St., 10 min forsinket, næste stop Gelsted St.',
      '250S mod Dragør Stationsplads, 8 min forsinket, næste stop Tømmerup (Englandsvej)',
    ])
    expect(panel).toHaveTextContent(
      'Ud af 406 ture med forsinkelser fra Rejseplanen nu. Metroen og letbanen sender ingen. Opdateret 09:21:52',
    )
  })

  it('lists the next four latest, each with its line, destination, next stop and delay', async () => {
    await open('en')
    const panel = await press(/^Biggest delay right now:/)
    const list = within(panel).getByRole('region', { name: 'Next latest' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(4)
    expect(
      within(list)
        .getAllByRole('button')
        .map((row) => row.getAttribute('aria-label')),
    ).toEqual([
      '144 to Vallensbæk St., 22 min late, next stop Lundbækvej (Vejlegårdsvej)',
      '123 to Roskilde St., 10 min late, next stop Kong Valdemars Vej (Algade)',
      'IC to Østerport St., 10 min late, next stop Gelsted St.',
      '250S to Dragør Stationsplads, 8 min late, next stop Tømmerup (Englandsvej)',
    ])
    const second = rows[0]
    expect(within(second).getByText('144')).toHaveAttribute('data-line', 'bus')
    expect(within(second).getByText('Vallensbæk St.')).toBeInTheDocument()
    expect(within(second).getByText('Next stop: Lundbækvej (Vejlegårdsvej)')).toBeInTheDocument()
    expect(second.querySelector('.pn-Delay')).toHaveTextContent(/^\+22 min/)
  })

  it('says what the ranking was drawn from, and when the delays came', async () => {
    await open('en')
    const panel = await press(/^Biggest delay right now:/)
    expect(panel.querySelector('.pn-SourceLine')).toHaveTextContent(
      'Of 406 trips with delays from Rejseplanen now. The Metro and light rail send none. Updated 09:21:52',
    )
  })

  it("flies to a listed trip, rings it and opens its vehicle panel when it's tapped", async () => {
    await open('en')
    const panel = await press(/^Biggest delay right now:/)
    expect(flown).toEqual([LATEST])
    const list = within(panel).getByRole('region', { name: 'Next latest' })
    fireEvent.click(within(list).getByRole('button', { name: /^144 to Vallensbæk St\./ }))
    expect(query().get('trip')).toBe(SECOND)
    expect(query().get('latest')).toBeNull()
    expect(vehicleSpotlight.get()).toBe(SECOND)
    expect(flown).toEqual([LATEST, SECOND])
    expect(await screen.findByRole('dialog', { name: /to Vallensbæk St\./ })).toBeInTheDocument()
  })

  it('follows the trip it leads with, and shows its whole line, as its vehicle panel does', async () => {
    await open('en')
    const panel = await press(/^Biggest delay right now:/)
    const lead = within(panel).getByRole('region', { name: 'The latest trip' })
    const follow = within(lead).getByRole('button', { name: 'Follow' })
    await vi.waitFor(() => expect(follow).toBeEnabled())
    fireEvent.click(follow)
    expect(followedVehicle.get()).toBe(LATEST)
    expect(follow).toHaveAttribute('aria-pressed', 'true')
    // The map moving under it keeps Follow and the ring, the panel open.
    act(() => mapView.update({ centre: [12.4, 55.9], zoom: 14 }))
    expect(followedVehicle.get()).toBe(LATEST)
    fireEvent.click(within(lead).getByRole('button', { name: 'Show whole line' }))
    expect(followedVehicle.get()).toBeUndefined()
    expect(mapHighlight.get()).toBeDefined()
    expect(await screen.findByRole('button', { name: /^Showing: line 950R/ })).toBeInTheDocument()
  })

  it('keeps leading with the trip it picked when the next snapshot names another latest', async () => {
    await open('en')
    const panel = await press(/^Biggest delay right now:/)
    const next: Snapshot = {
      ...minute2,
      trips: minute2.trips.map((trip): SnapshotTrip =>
        trip.key === LATEST ? { ...trip, delay: 60 } : trip,
      ),
    }
    act(() => liveSnapshot.update({ snapshot: next, clockOffset: 0 }))
    const lead = within(panel).getByRole('region', { name: 'The latest trip' })
    expect(within(lead).getByRole('heading', { name: 'to Hillerød' })).toBeInTheDocument()
    expect(lead.querySelector('.pn-Delay')).toHaveTextContent(/^\+1 min/)
    // The list is the ranking's now, the trip it leads with left out.
    const list = within(panel).getByRole('region', { name: 'Next latest' })
    expect(within(list).getAllByRole('button')[0]).toHaveAccessibleName(/^144 to Vallensbæk St\./)
    expect(within(list).getAllByRole('button')).toHaveLength(4)
    expect(vehicleSpotlight.get()).toBe(LATEST)
    expect(flown).toEqual([LATEST])
  })

  it('opens from its link on the trip running latest then, rung and flown to', async () => {
    await open('en', minute2, '?latest=now')
    const panel = await screen.findByRole('dialog', { name: 'Latest right now' })
    const lead = await within(panel).findByRole('region', { name: 'The latest trip' })
    expect(within(lead).getByRole('heading', { name: 'to Hillerød' })).toBeInTheDocument()
    expect(vehicleSpotlight.get()).toBe(LATEST)
    expect(flown).toEqual([LATEST])
    expect(query().get('latest')).toBe('now')
  })

  it('lists the latest with none picked, and rings none, when no trip is 3 min late', async () => {
    await open('en', calm(120))
    const panel = await press(/^Latest now \+2 min at most$/)
    expect(within(panel).queryByRole('region', { name: 'The latest trip' })).toBeNull()
    expect(within(panel).getByText('No trip runs 3 min late or more now.')).toBeInTheDocument()
    const list = within(panel).getByRole('region', { name: 'Latest trips' })
    const rows = within(list).getAllByRole('button')
    expect(rows).toHaveLength(5)
    expect(rows[0]).toHaveAccessibleName(/, 2 min late, next stop /)
    expect(vehicleSpotlight.get()).toBeUndefined()
    expect(flown).toEqual([])
  })

  it('lists the trips on time when none runs late, in Danish too', async () => {
    await open('da', calm(0))
    const panel = await press(/^Mest forsinket nu højst 0 min$/, 'Mest forsinket lige nu')
    expect(
      within(panel).getByText('Ingen tur er 3 min forsinket eller mere lige nu.'),
    ).toBeInTheDocument()
    const rows = within(
      within(panel).getByRole('region', { name: 'Mest forsinkede ture' }),
    ).getAllByRole('button')
    expect(rows).toHaveLength(5)
    for (const row of rows) expect(row).toHaveAccessibleName(/ mod .+, til tiden, næste stop /)
  })

  it('lists none when every trip with a delay runs early', async () => {
    const early: Snapshot = {
      ...minute2,
      trips: minute2.trips.map((trip) =>
        trip.delay === undefined ? trip : { ...trip, delay: -Math.abs(trip.delay) - 60 },
      ),
    }
    await open('en', early)
    const panel = await press(/^Latest now 0 min at most$/)
    expect(within(panel).getByText('Every trip with a delay runs early now.')).toBeInTheDocument()
    expect(within(panel).queryByRole('listitem')).toBeNull()
  })

  it('names no trip, and lists none, once the delays stop coming', async () => {
    await open('en')
    const panel = await press(/^Biggest delay right now:/)
    const quiet = { ...minute2, fetched: minute2.updates.lastMessage! + 5 * 60_000 }
    vi.setSystemTime(quiet.fetched)
    act(() => liveSnapshot.update({ snapshot: quiet, clockOffset: 0 }))
    expect(
      within(panel).getByText('Delays from Rejseplanen not updated since 09:21'),
    ).toBeInTheDocument()
    expect(within(panel).queryByRole('region', { name: 'The latest trip' })).toBeNull()
    expect(within(panel).queryByRole('listitem')).toBeNull()
    expect(vehicleSpotlight.get()).toBeUndefined()
  })

  it('says no trip shows a delay, from a link, when only the Metro runs', async () => {
    const metroOnly = { ...minute2, trips: minute2.trips.filter((trip) => trip.mode === 'metro') }
    await open('en', metroOnly, '?latest=now')
    const panel = await screen.findByRole('dialog', { name: 'Latest right now' })
    expect(within(panel).getByText('No trip on the map shows a delay')).toBeInTheDocument()
    expect(within(panel).getByText('The Metro and light rail send none.')).toBeInTheDocument()
    expect(vehicleSpotlight.get()).toBeUndefined()
    expect(flown).toEqual([])
  })

  it('opens from the bottom on a phone, as every detail panel does', async () => {
    phone = true
    await open('en')
    const panel = await press(/^Biggest delay right now:/)
    expect(panel.closest('[data-anchor]')).toHaveAttribute('data-anchor', 'bottom')
  })
})
