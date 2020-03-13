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

echo "Pushing image $image_tag to $ecr_repository"
docker push $ecr_repository/$image_tag

