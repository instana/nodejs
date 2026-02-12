#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2021
#######################################

set -eo pipefail

WATCH=false
SCOPE=""
PACKAGE=""
VERSION=""
GREP_PATTERN=""

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
    if [[ $arg == *"@"* ]]; then
      PACKAGE="${arg%@*}"
      VERSION="${arg#*@}"
    else
      PACKAGE="$arg"
    fi
    shift
    ;;
  esac
done

args=""

if [ "$WATCH" = true ]; then
  args="-- --watch"
fi

if [ -n "$PACKAGE" ]; then
  AVAILABLE_VERSIONS=$(find "packages/collector/test/tracing/databases/$PACKAGE" -maxdepth 1 -type d -name "_v*" 2>/dev/null | sed 's/.*_v/v/' | sort -V | tr '\n' ', ' | sed 's/,$//')

  if [ -n "$VERSION" ]; then
    if [[ ! $VERSION =~ ^v ]]; then
      VERSION="v$VERSION"
    fi

    if [ ! -d "packages/collector/test/tracing/databases/$PACKAGE/_${VERSION}" ]; then
      echo "Error: Version not found. We only have: $AVAILABLE_VERSIONS"
      exit 1
    fi

    GREP_PATTERN="tracing/$PACKAGE@$VERSION"
  else
    HIGHEST_VERSION=$(find "packages/collector/test/tracing/databases/$PACKAGE" -maxdepth 1 -type d -name "_v*" 2>/dev/null | sed 's/.*_v//' | sort -n | tail -1)
    if [ -n "$HIGHEST_VERSION" ]; then
      GREP_PATTERN="tracing/$PACKAGE@v$HIGHEST_VERSION"
    else
      GREP_PATTERN="tracing/$PACKAGE@v"
    fi
  fi
  args="-- --grep \"$GREP_PATTERN\" $args"
  echo "Running tests for $PACKAGE${VERSION:+ version $VERSION} (grep pattern: $GREP_PATTERN)"
else
  echo "Running all tests with $SCOPE $args"
fi

npx lerna exec --scope="$SCOPE" "npm run test:debug $args"
