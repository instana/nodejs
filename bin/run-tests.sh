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

args=""

if [ "$WATCH" = true ]; then
  args="-- --watch"
fi

echo "Running tests with $SCOPE and $args:"
npx lerna exec --scope="$SCOPE" "npm run test:debug $args"

