#!/usr/bin/env bash
set -eEuo pipefail

cd `dirname $BASH_SOURCE`

source .env

siege -c1 -d3s http://localhost:$APP_PORT

