#!/usr/bin/env bash

set -eo pipefail

cd `dirname $BASH_SOURCE`/../packages/shared-metrics

npm run test:debug

