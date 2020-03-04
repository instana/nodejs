#!/usr/bin/env bash

set -eo pipefail

cd `dirname $BASH_SOURCE`/../packages/serverless

npm run test:debug

