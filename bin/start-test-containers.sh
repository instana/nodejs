#!/usr/bin/env bash

set -eo pipefail

cd `dirname $BASH_SOURCE`/..

# We aren't properly shutting down these services. Therefore the internal data
# store might get corrupted. If you encounter suspicious failures in your test
# runs, restart this script to completely clean up existing images.

docker-compose kill
docker-compose rm -f
docker-compose up

