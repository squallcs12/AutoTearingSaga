#!/bin/bash
N=${1:-4}
for i in $(seq 1 $N); do
  npx wdio --spec android/specs/arena.e2e.js > /dev/null && node scripts/notify.js success && exit 0
done
node scripts/notify.js fail