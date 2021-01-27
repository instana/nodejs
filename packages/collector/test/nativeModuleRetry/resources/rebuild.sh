#!/usr/bin/env bash
set -eo pipefail
#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. and contributors 2020
#######################################


cd `dirname $BASH_SOURCE`

tar xf ../../../../../packages/shared-metrics/addons/linux/x64/musl/88/event-loop-stats.tar.gz
tar xf ../../../../../packages/shared-metrics/addons/linux/x64/musl/88/gcstats.js.tar.gz
cat /dev/null > event-loop-stats/build/Release/eventLoopStats.node
cat /dev/null > gcstats.js/build/Release/gcstats.node
tar -czf event-loop-stats-corrupt.tar.gz event-loop-stats
tar -czf gcstats.js-corrupt.tar.gz gcstats.js
rm -rf event-loop-stats gcstats.js
