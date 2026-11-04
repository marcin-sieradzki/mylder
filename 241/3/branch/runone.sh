#!/usr/bin/env bash
# runone.sh <run-id> [--phone] <journey>... : drive journeys one at a time
cd /home/user/mylder-verify/238-branch
export PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium
R=$1; shift; PHONE=; if [ "$1" = --phone ]; then PHONE=--phone; shift; fi
for n in "$@"; do echo "== $n $(date +%T)"; node .claude/skills/verify-mylder/scripts/drive.ts $R .verify/$R/journeys/$n.ts $PHONE > .verify/$R/$n.out 2>&1; tail -1 .verify/$R/$n.out; done
.claude/skills/verify-mylder/scripts/doctor.sh $R
