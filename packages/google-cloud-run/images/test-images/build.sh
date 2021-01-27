#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. and contributors 2020
#######################################

set -eo pipefail

cd `dirname $BASH_SOURCE`

source utils

normalizeArgs $1 $2 $3

if [[ ! -f .env ]]; then
  echo .env file is missing
  exit 1
fi

source .env

if [[ -z "${image_tag_prefix-}" ]]; then
  echo Please set image_tag_prefix in .env.
  exit 1
fi
if [[ -z "${container_name_prefix-}" ]]; then
  echo Please set container_name_prefix in .env.
  exit 1
fi

dockerfile=Dockerfile-$LINUX_DISTRIBUTION
if [[ ! -f "$dockerfile" ]]; then
  echo "No Dockerfile for distribution $LINUX_DISTRIBUTION, $dockerfile does not exist."
  exit 1
fi

if [[ $INSTANA_LAYER_MODE = local ]]; then
  echo Building local Instana layer first.
  pushd ../instana-google-cloud-run > /dev/null
  ./build.sh local
  popd > /dev/null
else
  echo Not building local Instana layer.
fi

setImageTag $image_tag_prefix $NODEJS_VERSION $LINUX_DISTRIBUTION $INSTANA_LAYER_MODE
setContainerName $container_name_prefix $NODEJS_VERSION $LINUX_DISTRIBUTION $INSTANA_LAYER_MODE

echo "Stopping and removing container $container_name"
docker rm -f $container_name || true

echo "Removing image $image_tag"
docker rmi -f $image_tag

echo "Building $dockerfile -> $image_tag"
docker build \
  --build-arg NODEJS_VERSION=$NODEJS_VERSION \
  --build-arg INSTANA_LAYER=$INSTANA_LAYER \
  -f $dockerfile \
  -t $image_tag \
  -t $gcr_repository/$image_tag \
  .
echo "docker build exit status: $?"

