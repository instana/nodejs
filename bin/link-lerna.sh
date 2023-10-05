#!/usr/bin/env bash

set -eo pipefail

cd `dirname $BASH_SOURCE`/..

node_version=$(node -v)

if [[ "$(node -e "console.log((process.versions.node).split('.')[0] < 16)")" == "true" ]]; then
  rm -rf node_modules/lerna
  ln -fs ./lernav6 ./node_modules/lerna
  ln -fs ../lerna/cli.js node_modules/.bin/lerna
fi