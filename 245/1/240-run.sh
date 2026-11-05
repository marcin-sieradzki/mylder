#!/usr/bin/env bash
# usage: 240-run.sh <side> <run> <journey> [--phone] ...
side=$1; run=$2; shift 2
cd /home/user/mylder-verify/240-$side || exit 1
export PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium
for j in "$@"; do
  flag=; case $j in *phone*) flag=--phone;; esac
  echo "=== $j $flag $(date +%T)"
  timeout 400 node .claude/skills/verify-mylder/scripts/drive.ts $run .verify/$run/journeys/$j.ts $flag 2>&1 | grep -v '^$' | tail -45 | cut -c1-600
done
