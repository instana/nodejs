#!/usr/bin/env bash

set -eo pipefail

cd `dirname $BASH_SOURCE`

if [[ ! -f .env ]]; then
  echo .env file is missing
  exit 1
fi
source .env

dockerfile=Dockerfile

echo "Stopping and removing container $containername"
docker rm -f $containername || true

echo "Removing image $imagetag"
docker rmi -f $imagetag

echo "Building $dockerfile -> $imagetag"
docker build -f $dockerfile -t $imagetag -t $ecr_repository/$imagetag .
echo "docker build exit status: $?"

