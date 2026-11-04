import { describe, expect, it } from 'vitest'
import { decide, MARGIN, ROW, type Measure, type Placement } from './latestPlace'

// Where the Latest now pill sits (docs/screens.md, "Latest now"): `decide` turns the bar's layout,
// as the page measures it, into a placement. The browser's layout is the e2e journeys' to prove
// (e2e/delays.spec.ts); here a layout is a function of the placement, as a browser's is, and the
// pill must settle on whatever it answers, never moving to and fro on every commit.

/** A pill whose words take 400 px, cut to its stop's tenth character in 300. */
const pill = { natural: 400, least: 300 }

/** A layout that answers the same wherever the pill is, as one with room to spare does. */
const steady =
  (room: number, oneRow = true) =>
  (placement: Placement): Measure => ({
    key: 'k',
    inBar: placement.place === 'bar',
    oneRow,
    room,
    ...pill,
  })

/** The placements a layout leads to from the pill's first, on its row, measured `steps` times. */
function settle(layout: (placement: Placement) => Measure, steps = 50): Placement[] {
  let placement = ROW
  let wrapped: string | undefined
  const placements = [placement]
  for (let step = 0; step < steps; step++) {
    const decided = decide(placement, layout(placement), wrapped)
    wrapped = decided.wrapped
    if (decided.placement !== placement) {
      placement = decided.placement
      placements.push(placement)
    }
  }
  return placements
}

describe('where the Latest now pill sits', () => {
  it('moves into the bar whole where the bar has room for all its words', () => {
    expect(settle(steady(450))).toEqual([ROW, { place: 'bar' }])
  })

  it('moves into the bar cut to its room where that keeps the start of its stop', () => {
    expect(settle(steady(350.7))).toEqual([ROW, { place: 'bar', room: 350 }])
  })

  it('keeps its row with less than its least and a margin to spare in the bar', () => {
    expect(settle(steady(pill.least + MARGIN - 0.5))).toEqual([ROW])
    expect(settle(steady(pill.least + MARGIN))).toEqual([ROW, { place: 'bar', room: 308 }])
  })

  it('keeps its row while the bar is on two rows without it', () => {
    expect(settle(steady(450, false))).toEqual([ROW])
  })

  it('takes its row once its room in the bar falls below its least', () => {
    const decided = decide({ place: 'bar', room: 320 }, { ...steady(299)(ROW), inBar: true })
    expect(decided).toEqual({ placement: ROW })
  })

  it('answers with the placement it had when nothing changes, so the bar renders no more', () => {
    const had: Placement = { place: 'bar', room: 350 }
    expect(decide(had, { ...steady(350.7)(had) }).placement).toBe(had)
  })

  it('settles where the bar wraps whenever the pill is in it, though its row says it fits', () => {
    // The row's measure promises room the bar, with the pill in it, doesn't give.
    const wraps = (placement: Placement): Measure => ({
      ...steady(450)(placement),
      oneRow: placement.place === 'row',
    })
    expect(settle(wraps)).toEqual([ROW, { place: 'bar' }, ROW])
  })

  it('tries the bar again once the words or the width change after it wrapped', () => {
    const wrapped = decide({ place: 'bar' }, { ...steady(450)(ROW), inBar: true, oneRow: false })
    expect(wrapped).toEqual({ placement: ROW, wrapped: 'k' })
    expect(decide(ROW, steady(450)(ROW), wrapped.wrapped).placement).toBe(ROW)
    expect(decide(ROW, { ...steady(450)(ROW), key: 'other' }, wrapped.wrapped).placement).toEqual({
      place: 'bar',
    })
  })

  it('settles where rounding gives its room a pixel more or less each time', () => {
    // At an even room the bar measures it half a pixel short; at an odd one, a pixel and a half
    // over: it would take 299, then 300, then 299, on every commit.
    const rounding = (placement: Placement): Measure => {
      const room = placement.place === 'bar' ? placement.room! : 300
      return {
        ...steady(0)(placement),
        room: room % 2 === 0 ? room - 0.5 : room + 1.5,
        natural: 400,
        least: 200,
      }
    }
    const placements = settle((placement) =>
      placement.place === 'row' ? { ...rounding(placement), room: 300.5 } : rounding(placement),
    )
    expect(placements).toEqual([ROW, { place: 'bar', room: 300 }, { place: 'bar', room: 299 }])
  })

  it('settles where its words fit in the bar only while it is cut to its room', () => {
    // Whole, the bar leaves it a fraction short; cut to its room, a fraction over.
    const edge = (placement: Placement): Measure => ({
      ...steady(0)(placement),
      room: placement.place === 'bar' && placement.room !== undefined ? 400.2 : 399.8,
    })
    const placements = settle((placement) =>
      placement.place === 'row' ? { ...edge(placement), room: 450 } : edge(placement),
    )
    expect(placements).toEqual([ROW, { place: 'bar' }, { place: 'bar', room: 399 }])
  })
})
