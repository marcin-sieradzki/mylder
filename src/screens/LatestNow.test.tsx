import '@mylder/perron/tokens.css'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import da from '../i18n/da.json'
import en from '../i18n/en.json'
import type { Lang } from '../i18n/lang'
import { PHONE_QUERY } from '../map/highlight'
import { liveSnapshot } from '../map/live'
import { openPanel } from '../map/view'
import { timetableRoutesOf } from '../test/timetableRoutes'
import type { Snapshot, SnapshotTrip } from '../tracker/index'
import { WIDE_QUERY } from './LatestNow'
import { MapScreen } from './MapScreen'
import { Providers } from './Providers'

// The Latest now pill in the top bar (docs/screens.md, "Latest now"; spec #237, #238), on the
// timetable source with `MYLDER_UPDATES=recording:siri-et`, saved in recordings/siri-et: its second
// minute, 09:22:00 in Copenhagen on Saturday 31 October 2026, the delays' last message at
// 09:21:52. The trip furthest behind its timetable is the 950R to Hillerød, 77 min late, 846 m
// past Slotspavillonen St. and 846 m short of Hillerød St., its next stop; then the 144 to
// Vallensbæk St., 22 min late, standing at Idræts Allé (Vejlegårdsvej). Read off the snapshot's
// trips and their patterns' stops in the recording's timetable.
const folder = join(process.cwd(), 'recordings', 'siri-et')
const saved = (name: string) =>
  JSON.parse(readFileSync(join(folder, 'snapshots', name), 'utf8')) as Snapshot
const minute2 = saved('0002.json')
const LATEST = 'train.950R.bacca19217.20261031.0733'

/** The minute with every delay `delay` seconds or less, as a calm network runs. */
const calm = (delay: number): Snapshot => ({
  ...minute2,
  trips: minute2.trips.map((trip) =>
    trip.delay === undefined ? trip : { ...trip, delay: Math.min(trip.delay, delay) },
  ),
})

/** The minute with only its Metro trips, every one Timetable only: the Metro at night. */
const metroOnly: Snapshot = {
  ...minute2,
  trips: minute2.trips.filter((trip) => trip.mode === 'metro'),
}

/** The timetable source's minute without SIRI-ET: no feed, and no trip with a delay. */
const delaysOff = JSON.parse(
  readFileSync(
    join(process.cwd(), 'recordings', 'timetable-source', 'snapshots', '0006.json'),
    'utf8',
  ),
) as Snapshot

/**
 * The `empty` recording's first minute: Rejseplanen's answers with every trip Timetable only and
 * none with a delay, SIRI-ET off. Rejseplanen can send delays, so the delays are on.
 */
const empty = JSON.parse(
  readFileSync(join(process.cwd(), 'recordings', 'empty', 'snapshots', '0001.json'), 'utf8'),
) as Snapshot

/** Whether the page is as narrow as a phone, or wide enough for the pill in the bar, as each test sets it. */
let phone = false
let wide = true
const mediaLists = new Map<string, object>()
/** The browser's `matchMedia`, which jsdom lacks: the phone's query with `phone`, the wide one's with `wide`. */
function matchMedia(query: string) {
  let list = mediaLists.get(query)
  if (!list) {
    list = {
      get matches() {
        return query === PHONE_QUERY ? phone : query === WIDE_QUERY && wide
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

/** Opens the map in `lang` on `snapshot`, the server's clock `after` ms past its fetch. */
async function open(lang: Lang, snapshot: Snapshot = minute2, after = 0) {
  vi.setSystemTime(snapshot.fetched + after)
  act(() => liveSnapshot.update({ snapshot, clockOffset: 0 }))
  window.history.replaceState(null, '', `/${lang}`)
  render(
    <Providers lang={lang} dictionary={lang === 'da' ? da : en}>
      <MapScreen />
    </Providers>,
  )
  // The pill waits for the timetable, which names the stops and colours the badge.
  await screen.findByRole('group', { name: lang === 'da' ? 'Filtre' : 'Filters' })
}

const banner = () => screen.getByRole('banner')

beforeEach(() => {
  phone = false
  wide = true
  vi.stubGlobal('matchMedia', matchMedia)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.stubGlobal('fetch', routes)
})

afterEach(() => {
  act(() => openPanel(undefined))
  act(() => liveSnapshot.update({ snapshot: undefined, clockOffset: 0 }))
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('the Latest now pill', () => {
  it('names the trip running latest, its delay and the stop it last passed', async () => {
    await open('en')
    const pill = within(banner()).getByRole('button', { name: /^Biggest delay right now:/ })
    expect(pill).toHaveAccessibleName(
      'Biggest delay right now: 950R to Hillerød, 77 min late, between Slotspavillonen St. and Hillerød St.',
    )
    expect(within(pill).getByText('Latest now')).toBeInTheDocument()
    // A regional train's badge, in the regional trains' colours.
    expect(within(pill).getByText('950R')).toHaveAttribute('data-line', 'regional')
    // Perron's Delay, a late one's "+77 min", its words heard as "77 min late".
    const delay = pill.querySelector('.pn-Delay')!
    expect(delay).toHaveAttribute('data-delay', 'late')
    expect(delay).toHaveTextContent(/^\+77 min/)
    expect(within(pill).getByText('at Slotspavillonen St.')).toBeInTheDocument()
  })

  it('says it in Danish', async () => {
    await open('da')
    const pill = within(banner()).getByRole('button', { name: /^Største forsinkelse lige nu:/ })
    expect(pill).toHaveAccessibleName(
      'Største forsinkelse lige nu: 950R mod Hillerød, 77 min forsinket, mellem Slotspavillonen St. og Hillerød St.',
    )
    expect(within(pill).getByText('Mest forsinket nu')).toBeInTheDocument()
    expect(within(pill).getByText('ved Slotspavillonen St.')).toBeInTheDocument()
  })

  it("opens the named trip's vehicle panel in the address, as a tap on its dot does", async () => {
    await open('en')
    fireEvent.click(within(banner()).getByRole('button', { name: /^Biggest delay right now:/ }))
    expect(new URLSearchParams(window.location.search).get('trip')).toBe(LATEST)
    expect(await screen.findByRole('dialog', { name: /to Hillerød/ })).toHaveTextContent(
      /^950R950R to HillerødTrain/,
    )
  })

  it('follows the next snapshot to the trip latest then', async () => {
    await open('en')
    const next: Snapshot = {
      ...minute2,
      trips: minute2.trips.map((trip): SnapshotTrip =>
        trip.key === LATEST ? { ...trip, delay: 60 } : trip,
      ),
    }
    act(() => liveSnapshot.update({ snapshot: next, clockOffset: 0 }))
    // The 950R now 1 min late, the 144 leads; it stands at a stop, so it is at it, not between.
    const pill = within(banner()).getByRole('button', { name: /^Biggest delay right now:/ })
    expect(pill).toHaveAccessibleName(
      'Biggest delay right now: 144 to Vallensbæk St., 22 min late, at Idræts Allé (Vejlegårdsvej)',
    )
    expect(within(pill).getByText('at Idræts Allé (Vejlegårdsvej)')).toBeInTheDocument()
  })

  it('names no trip when none is 3 min late', async () => {
    await open('en', calm(120))
    expect(within(banner()).queryByRole('button', { name: /^Biggest delay/ })).toBeNull()
    expect(within(banner()).getByText('Latest now +2 min at most')).toBeInTheDocument()
  })

  it('names no trip when none is 3 min late, in Danish', async () => {
    await open('da', calm(120))
    expect(within(banner()).getByText('Mest forsinket nu højst +2 min')).toBeInTheDocument()
  })

  it('says since when the delays have not come once the feed is quiet', async () => {
    // Five minutes past the last message, at 09:21:52, the feed is no longer fresh.
    const after = minute2.updates.lastMessage! + 5 * 60_000 - minute2.fetched
    await open('en', minute2, after)
    expect(within(banner()).queryByRole('button', { name: /^Biggest delay/ })).toBeNull()
    expect(
      within(banner()).getByText('Delays from Rejseplanen not updated since 09:21'),
    ).toBeInTheDocument()
  })

  it('says it in Danish once the feed is quiet', async () => {
    const after = minute2.updates.lastMessage! + 5 * 60_000 - minute2.fetched
    await open('da', minute2, after)
    expect(
      within(banner()).getByText('Forsinkelser fra Rejseplanen ikke opdateret siden 09:21'),
    ).toBeInTheDocument()
  })

  it('shows "—" and says the Metro sends no delays when no trip shows one', async () => {
    await open('en', metroOnly)
    const line = within(banner()).getByText(/^Latest now/)
    expect(line).toHaveTextContent(/^Latest now —Delay unknown · the Metro sends no delays$/)
    expect(within(banner()).queryByRole('button', { name: /^Biggest delay/ })).toBeNull()
  })

  it('shows "—" in Danish', async () => {
    await open('da', metroOnly)
    expect(within(banner()).getByText(/^Mest forsinket nu/)).toHaveTextContent(
      /^Mest forsinket nu —.+ · Metroen sender ingen forsinkelser$/,
    )
  })

  it('shows "—" on a source that sends delays when no trip has one', async () => {
    vi.stubGlobal('fetch', timetableRoutesOf('empty'))
    await open('en', empty)
    expect(await within(banner()).findByText(/^Latest now/)).toHaveTextContent(
      /^Latest now —Delay unknown · the Metro sends no delays$/,
    )
  })

  it('shows "—" in Danish on a source that sends delays when no trip has one', async () => {
    vi.stubGlobal('fetch', timetableRoutesOf('empty'))
    await open('da', empty)
    expect(await within(banner()).findByText(/^Mest forsinket nu/)).toHaveTextContent(
      /^Mest forsinket nu —.+ · Metroen sender ingen forsinkelser$/,
    )
  })

  it('is absent with the delays off', async () => {
    vi.stubGlobal('fetch', timetableRoutesOf('timetable-source'))
    await open('en', delaysOff)
    expect(within(banner()).queryByText(/Latest now|Delays from Rejseplanen/)).toBeNull()
    expect(within(banner()).queryByRole('button', { name: /^Biggest delay/ })).toBeNull()
  })

  it('sits among the top bar’s tools on a wide screen', async () => {
    await open('en')
    const pill = within(banner()).getByRole('button', { name: /^Biggest delay right now:/ })
    const about = within(banner()).getByRole('button', { name: 'About Mylder' })
    expect(pill.parentElement).toBe(about.parentElement)
  })

  it('takes a row of its own under the top bar, centred, between a phone and a wide screen', async () => {
    wide = false
    await open('en')
    const pill = within(banner()).getByRole('button', { name: /^Biggest delay right now:/ })
    const bar = within(banner())
      .getByRole('button', { name: 'About Mylder' })
      .closest('.pn-TopBar')!
    expect(bar.contains(pill)).toBe(false)
    expect(pill.parentElement).toHaveClass('pn-Surface')
    expect(pill.parentElement).toHaveAttribute('data-place', 'centred')
  })

  it('takes a row of its own under the top bar on a phone', async () => {
    phone = true
    wide = false
    await open('en')
    const pill = within(banner()).getByRole('button', { name: /^Biggest delay right now:/ })
    const about = within(banner()).getByRole('button', { name: 'About Mylder' })
    const bar = about.closest('.pn-TopBar')!
    expect(bar.contains(pill)).toBe(false)
    // After the bar in the header, on glass of its own.
    expect(bar.compareDocumentPosition(pill) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(pill.parentElement).toHaveClass('pn-Surface')
    expect(pill.parentElement).toHaveAttribute('data-place', 'phone')
  })
})
