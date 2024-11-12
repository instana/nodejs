#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2021
#######################################

set -eo pipefail

WATCH=false
SCOPE=""

for arg in "$@"; do
  case $arg in
    --watch)
      WATCH=true
      shift
      ;;
    --scope=*)
      SCOPE="${arg#*=}"
      shift
      ;;
    *)
      shift
      ;;
  esac
done

if [ "$WATCH" = true ]; then
  export npm_config_watch="--watch"
else
  export npm_config_watch=""
fi

echo "Running tests with $SCOPE and $npm_config_watch:"
npx lerna exec --scope="$SCOPE" "npm run test:debug"

