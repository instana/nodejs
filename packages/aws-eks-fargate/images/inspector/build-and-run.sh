#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2023
#######################################

set -eo pipefail

cd `dirname $BASH_SOURCE`

if [[ ! -f .env ]]; then
  echo .env file is missing
  exit 1
fi
source .env

./build.sh


echo "Running container $containername from image $imagetag"
docker run -p 127.0.0.1:3000:3000/tcp --name $containername $imagetag

