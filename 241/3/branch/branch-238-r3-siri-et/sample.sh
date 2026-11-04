#!/usr/bin/env bash
cd /home/user/mylder-verify/238-branch
export PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium
R=branch-238-r3-siri-et; D=.verify/$R
for i in 1 2 3; do
  for l in en da; do n=latest-sample$i-$l; echo "== $n $(date +%T)"; WIDTHS=360,412,800,1000,1100,1280,1440,1920 SKIP_PANELS=1 node .claude/skills/verify-mylder/scripts/drive.ts $R $D/journeys/$n.ts > $D/$n.out 2>&1; tail -1 $D/$n.out; done
  [ $i -lt 3 ] && sleep 240
done
.claude/skills/verify-mylder/scripts/doctor.sh $R
