#!/usr/bin/env bash

set -eo pipefail

cd `dirname $BASH_SOURCE`

if [[ ! -f .env ]]; then
  echo .env file is missing
  exit 1
fi
source .env

./build.sh

source .env

echo "Pushing image $imagetag to $gcr_repository"
docker push $gcr_repository/$imagetag

