#!/usr/bin/env bash
export PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium
R=branch-238-r3-siri-et; D=.verify/$R
j() { local name=$1; shift; local file=$1; shift; echo "== $name $(date +%T)"; env "$@" node .claude/skills/verify-mylder/scripts/drive.ts $R $D/journeys/$file.ts $PHONE > $D/$name.out 2>&1; tail -1 $D/$name.out; }
PHONE= j latest-standout latest-standout
PHONE= j latest-standout-da latest-standout-da
PHONE= j latest-open latest-open
PHONE= j latest-layout latest-layout
PHONE= j latest-layout-da latest-layout-da
cp $D/journeys/latest-layout.ts $D/journeys/latest-layout-phone.ts; cp $D/journeys/latest-layout-da.ts $D/journeys/latest-layout-phone-da.ts
PHONE=--phone j latest-layout-phone latest-layout-phone WIDTHS=412,360
PHONE=--phone j latest-layout-phone-da latest-layout-phone-da WIDTHS=412,360
PHONE= j reg-map-delays reg-map-delays
PHONE= j reg-trip-delays reg-trip-delays
PHONE= j reg-trip-list-facts reg-trip-list-facts
.claude/skills/verify-mylder/scripts/doctor.sh $R
