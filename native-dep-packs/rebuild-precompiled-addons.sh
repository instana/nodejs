#!/usr/bin/env bash
set -eo pipefail
#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. and contributors 2020
#######################################


cd `dirname $BASH_SOURCE`

declare -A ABI_VERSIONS=( \
  ["108"]="18.18" \
  ["115"]="20.19" \
  ["120"]="21.2" \
  ["127"]="22.0" \
  ["131"]="23.0" \
  ["137"]="24.0"
  )


LIBC_VARIANTS=( \
  "glibc" \
  "musl"
)

LINUX_ARCHS=( \
  "amd64" \
  "arm64" \
  "s390x"
)

#########
# Linux #
#########
if [[ -z "$BUILD_FOR_MACOS" ]]; then

  for ARCH in "${LINUX_ARCHS[@]}"; do
    source ./build-and-copy-node-modules-linux

    for ABI_VERSION in "${!ABI_VERSIONS[@]}"; do
      NODEJS_VERSION="${ABI_VERSIONS[$ABI_VERSION]}"

      for LIBC in "${LIBC_VARIANTS[@]}"; do
        # Skip musl for s390x as it is not building correctly
        if [[ "$ARCH" == "s390x" && "$LIBC" == "musl" ]]; then
          continue
        fi

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

    # Finding the native arch of host machine
    case "$(uname -m)" in
      x86_64|amd64) ARCH="x64" ;;
      arm64|aarch64) ARCH="arm64" ;;
      *) echo "Not supported arch type: $(uname -m)" >&2; exit 1 ;;
    esac
    
    source ./build-and-copy-node-modules-darwin

    for ABI_VERSION in ${!ABI_VERSIONS[@]}; do
      NODEJS_VERSION=${ABI_VERSIONS[$ABI_VERSION]}
      buildAndCopyModulesDarwin $ABI_VERSION $NODEJS_VERSION $ARCH
    done
 
  else
    echo Native addons for MacOS can only be built on MacOS.
    exit 1
  fi
fi