# Latest right now

The Latest now pill names the trip running furthest behind its timetable right now, anywhere on the map, among the trips whose delay is known: "Latest now [950R] +77 min at Slotspavillonen St.", its line badge, its delay in whole minutes and the stop it is at or last passed. A press opens that trip's vehicle panel. When no trip is 3 min late, when SIRI-ET's delays stop coming, or when no trip on the map shows a delay, it says so and names no trip; with the delays off there is no pill. It sits in the top bar's tools on a wide screen and on a row of its own under the bar on a phone.

## Sub-features

- `latest-standout` names the latest trip: line badge, signed whole-minute delay and "at <stop>", heard as "Biggest delay right now: <line> to <headsign>, <n> min late, between <stop> and <stop>" (or "at <stop>" where it stands at one).
- `latest-open` opens the named trip's vehicle panel on a press, kept in the address as `?trip=<key>`, as a tap on its dot does.
- `latest-calm` reads "Latest now +2 min at most" when no trip is 3 min late, naming no trip.
- `latest-quiet` reads "Delays from Rejseplanen not updated since HH:MM" once SIRI-ET's feed has sent nothing for 5 min, naming no trip.
- `latest-none` reads "Latest now —" and "the Metro sends no delays" when no trip on the map shows a delay.
- `latest-off` shows no pill with the delays off, as on the timetable source alone.
- `latest-phone` puts the pill on a row of its own under the top bar on a phone, never wider than the screen.
- `latest-da` says it all in Danish: "Mest forsinket nu", "Største forsinkelse lige nu: … min forsinket, mellem … og …".

## How to get to it (user POV)

- On a launch with SIRI-ET's delays (`launch.sh <run-id> <port> updates:siri-et`), open `/en`; the pill is in the top bar once the timetable has loaded.
- Press the pill.
- On a launch on the quiet moment (`launch.sh <run-id> <port> updates:siri-et/quiet`), open `/en` once the feed has gone quiet.
- On the `weekday` recording, open `/en`: Rejseplanen's own delays there name a trip too.
- On a launch on the timetable source (`launch.sh <run-id> <port> timetable`), open `/en`: no pill.
- Open `/da` for the Danish words; add `--phone` for the phone's layout.

## Driving it with drive.ts

Preconditions:

- A launch with `updates:siri-et` as the third argument, a minute after launch so the table has filled (timings in [`../SKILL.md`](../SKILL.md), Launch, "SIRI-ET's delays"); `doctor.sh` healthy.
- The trip the pill must name is read from `await (await page.request.get('/api/snapshot')).json()` at drive time: of its `trips` with no `cancelled`, a `delay` and a `state` of `live`, `ageing` or `estimated`, the one with the largest `delay`, a tie going to the smaller `key`. Its line is `line`, its headsign `headsign`, its delay `Math.round(delay / 60)` minutes. A snapshot lands each minute, so read it and check the pill inside `expect(...).toPass()`.

- **Standout.** `page.getByRole('banner').getByRole('button', { name: /^Biggest delay right now: / })` is visible; its name starts `Biggest delay right now: <line> to <headsign>, <n> min late, ` and goes on `between <stop> and <stop>` or `at <stop>`; its text holds `Latest now`, `<line>`, `+<n> min` and `at <stop>`, that stop the first of the two in its name, or its only one. `n` is 3 or more; when it isn't, the minute is calm (below).
- **Open.** Click the pill; the address has `?trip=<key>` of that trip, and `page.getByRole('dialog', { name: new RegExp(`to ${headsign}`) })` is visible with the line's badge.
- **Calm.** The recording promises no calm minute, and the screen tests cover one: when `/api/snapshot`'s largest known delay rounds under 3 min, `page.getByRole('banner').getByText(/^Latest now [+]\d+ min at most$/)` shows the largest, and no button named `/^Biggest delay/` is there.
- **None.** The recording promises no minute without a known delay, and the screen tests cover one: when no trip of `/api/snapshot` has a `delay` in one of those states, the banner's `getByText(/^Latest now —/)` holds `the Metro sends no delays`.
- **Quiet.** On a launch with `updates:siri-et/quiet`, once `/api/snapshot`'s `updates` reads `"fresh":false` (about 6 minutes in), the banner's `getByText('Delays from Rejseplanen not updated since 09:56')` is visible and no button named `/^Biggest delay/` is there; on `/da`, `Forsinkelser fra Rejseplanen ikke opdateret siden 09:56`. Before then the pill names a trip as in Standout.
- **Off.** On a launch with `timetable` as the third argument, `page.getByRole('banner').getByText(/Latest now|Delays from Rejseplanen/)` has a count of 0.
- **Danish.** On `/da` the button's name starts `Største forsinkelse lige nu: <line> mod <headsign>, <n> min forsinket, ` and its text holds `Mest forsinket nu` and `ved <stop>`.
- **Phone.** With `--phone`, the pill's `boundingBox()` starts at or below the bottom of `getByRole('button', { name: 'About Mylder' })`'s, and its right edge is within the viewport's width; on a desktop it sits beside the About button in the bar.

## Gotchas

- The pill waits for the timetable to load: give it the default timeout before asserting it is absent, and assert absence only after the Updated line and the mode chips show.
- The ranking is the whole map's, whatever the mode filters show: hiding a mode never changes the trip the pill names.
- On the `weekday` recording the delays are Rejseplanen's own, with SIRI-ET's off, so the pill names a trip there too (the S-tog A at 07:07, +4 min, in its first minute), and never says the feed is quiet.
- In the first seconds after launch, before the feed's first message, the pill reads "Delays from Rejseplanen not received yet": wait a minute.
- A snapshot can land between reading `/api/snapshot` and reading the pill: compare them inside `toPass()`.
