#!/usr/bin/env bash
set -eo pipefail
#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. and contributors 2020
#######################################


cd `dirname $BASH_SOURCE`

declare -A ABI_VERSIONS=( \
  ["108"]="18.18.2" \
  ["115"]="20.3.0" \
  ["120"]="21.2.0" \
  ["127"]="22.0.0" \
  ["131"]="23.0.0" \
  ["137"]="24.0.0"
  )

LIBC_VARIANTS=( \
  "glibc" \
  "musl"
)

ARCHS=( \
  "amd64" \
  "s390x"
)

#########
# Linux #
#########

if [[ -z "$BUILD_FOR_MACOS" ]]; then

  for ARCH in "${ARCHS[@]}"; do
    if [[ "$ARCH" == "s390x" ]]; then
        # Make nvm available in this script.
      export NVM_DIR="$HOME/.nvm"
      [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
      
      source ./build-and-copy-node-modules-linux-390x
    else
      source ./build-and-copy-node-modules-linux
    fi

    for ABI_VERSION in "${!ABI_VERSIONS[@]}"; do
      NODEJS_VERSION="${ABI_VERSIONS[$ABI_VERSION]}"
      for LIBC in "${LIBC_VARIANTS[@]}"; do
        buildAndCopyModulesLinux "$ABI_VERSION" "$NODEJS_VERSION" "$LIBC" "$ARCH"
      done
    done
  done

fi

#########
# MacOS #
#########

# Precompiled versions of the native addons for MacOS are neither added to version control nor are they part of the
# published packages. They are only built locally for test purposes.


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

    for ABI_VERSION in ${!ABI_VERSIONS[@]}; do
      NODEJS_VERSION=${ABI_VERSIONS[$ABI_VERSION]}
      buildAndCopyModulesDarwin $ABI_VERSION $NODEJS_VERSION
    done
  else
    echo Native addons for MacOS can only be built on MacOS.
    exit 1
  fi
fi