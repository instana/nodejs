#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2023
#######################################

set -eo pipefail

CJS_FILENAME=$1

if [[ -z $CJS_FILENAME ]]; then
  echo "Usage: $0 <filename>"
  exit 1
fi

MJS_FILENAME=${CJS_FILENAME%.js}.mjs

echo copying $CJS_FILENAME to $MJS_FILENAME
cp $CJS_FILENAME $MJS_FILENAME
echo converting $MJS_FILENAME from CommonJS to ES6
npx -y cjs-to-es6 --verbose $MJS_FILENAME
