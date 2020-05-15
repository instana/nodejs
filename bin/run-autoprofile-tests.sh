#!/usr/bin/env bash

set -eo pipefail

cd `dirname $BASH_SOURCE`/../packages/autoprofile

npm run test:debug

