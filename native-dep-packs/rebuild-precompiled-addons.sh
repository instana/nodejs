#!/usr/bin/env bash
set -eo pipefail
#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. and contributors 2020
#######################################


cd `dirname $BASH_SOURCE`

declare -A ABI_VERSIONS=( \
  ["48"]="6.17.1" \
  ["57"]="8.17.0" \
  ["64"]="10.23.0" \
  ["72"]="12.20.0" \
  ["83"]="14.15.1" \
  ["88"]="15.3.0" \
)
# Note: We do not provide for older non-LTS versions (Node.js 7, 9, 11, 13).

LIBC_VARIANTS=( \
  "glibc" \
  "musl"
)

#########
# Linux #
#########

if [[ -z "$BUILD_FOR_MACOS" ]]; then
  source ./build-and-copy-node-modules-linux

  rm -rf ../packages/shared-metrics/addons/linux

  for ABI_VERSION in ${!ABI_VERSIONS[@]}; do
    NODEJS_VERSION=${ABI_VERSIONS[$ABI_VERSION]}
    for LIBC in ${LIBC_VARIANTS[@]}; do
      buildAndCopyModulesLinux $ABI_VERSION $NODEJS_VERSION $LIBC
    done
  done
fi

#########
# MacOS #
#########

# Precompiled versions of the native addons are neither added to version control nor are they part of the published
# packages. They are only built locally for test purposes.


if [[ ! -z "$BUILD_FOR_MACOS" ]]; then
  if [[ "$OSTYPE" == "darwin"* ]]; then
    if [[ ! -e $HOME/.nvm ]]; then
      echo This script requires nvm to build native addons for multiple Node.js versions for MacOS.
      exit 1
    fi

    # Make nvm available in this script.
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

    source ./build-and-copy-node-modules-darwin

    rm -rf ../packages/shared-metrics/addons/darwin

    for ABI_VERSION in ${!ABI_VERSIONS[@]}; do
      if [[ $ABI_VERSION = 48 ]]; then
        echo "Skipping ABI version 48 for Darwin."
        continue
      fi

      NODEJS_VERSION=${ABI_VERSIONS[$ABI_VERSION]}
      buildAndCopyModulesDarwin $ABI_VERSION $NODEJS_VERSION
    done
  else
    echo Native addons for MacOS can only be built on MacOS.
    exit 1
  fi
fi

