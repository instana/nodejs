#!/usr/bin/env bash

node_version=$(node -v)

if [[ "$(node -e "console.log((process.versions.node).split('.')[0] < 16)")" == "true" ]]; then
  ln -s ../node_modules/lerna node_modules/lernav3
fi