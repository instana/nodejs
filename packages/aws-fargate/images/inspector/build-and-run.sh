#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. and contributors 2020
#######################################

set -eo pipefail

cd $(dirname $BASH_SOURCE)

if [[ ! -f .env ]]; then
  echo .env file is missing
  exit 1
fi
source .env

./build.sh

echo "Running container $containername from image $imagetag"
docker run --name $containername $imagetag
