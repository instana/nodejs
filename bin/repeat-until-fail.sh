#!/usr/bin/env bash

set -eo pipefail

cd `dirname $BASH_SOURCE`/../packages/collector

while [[ true ]]; do
  npm run test:debug
done
