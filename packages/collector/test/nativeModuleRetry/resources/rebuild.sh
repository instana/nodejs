#!/usr/bin/env bash
set -eo pipefail

cd `dirname $BASH_SOURCE`

tar xf ../../../../../packages/shared-metrics/addons/linux/x64/musl/88/event-loop-stats.tar.gz
tar xf ../../../../../packages/shared-metrics/addons/linux/x64/musl/88/gcstats.js.tar.gz
tar xf ../../../../../packages/collector/addons/linux/x64/musl/88/netlinkwrapper.tar.gz
cat /dev/null > event-loop-stats/build/Release/eventLoopStats.node
cat /dev/null > gcstats.js/build/Release/gcstats.node
cat /dev/null > netlinkwrapper/build/Release/netlinksocket.node
tar -czf event-loop-stats-corrupt.tar.gz event-loop-stats
tar -czf gcstats.js-corrupt.tar.gz gcstats.js
tar -czf netlinkwrapper-corrupt.tar.gz netlinkwrapper
rm -rf event-loop-stats gcstats.js netlinkwrapper
