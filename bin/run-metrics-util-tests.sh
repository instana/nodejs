#!/usr/bin/env bash

set -eo pipefail

cd `dirname $BASH_SOURCE`/../packages/metrics-util

npm run test:debug

