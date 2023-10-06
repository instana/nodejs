#!/usr/bin/env bash

set -eo pipefail

cd `dirname $BASH_SOURCE`/..

node_version=$(node -v)

if [[ "$(node -e "console.log((process.versions.node).split('.')[0] < 14)")" == "true" ]]; then
  npm i lerna@4.0.0 -D
fi