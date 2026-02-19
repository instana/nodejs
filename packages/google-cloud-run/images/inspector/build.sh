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

dockerfile=Dockerfile

echo "Stopping and removing container $containername"
docker rm -f $containername || true

echo "Removing image $imagetag"
docker rmi -f $imagetag

ROOT_DIR=$(git rev-parse --show-toplevel)
NVMRC_PATH="$ROOT_DIR/.nvmrc"
NODEJS_VERSION=$(cat "$NVMRC_PATH")
echo "Building $dockerfile -> $imagetag with Node version $NODEJS_VERSION"

docker build --build-arg NODEJS_VERSION=$NODEJS_VERSION -f $dockerfile -t $imagetag -t $ecr_repository/$imagetag .
echo "docker build exit status: $?"
