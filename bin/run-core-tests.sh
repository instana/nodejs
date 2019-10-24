#!/usr/bin/env bash

set -eo pipefail

cd `dirname $BASH_SOURCE`/../packages/core

npm test:debug

