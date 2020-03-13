#!/usr/bin/env bash

set -eo pipefail

cd `dirname $BASH_SOURCE`

if [[ ! -f .env ]]; then
  echo .env file is missing
  exit 1
fi
source .env

./build.sh


echo "Running container $containername from image $imagetag"
docker run --name $containername $imagetag

