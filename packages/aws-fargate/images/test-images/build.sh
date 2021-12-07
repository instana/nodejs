#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. and contributors 2020
#######################################

set -eo pipefail

cd `dirname $BASH_SOURCE`

source utils

# $1: Instana Layer Mode, aka which Docker base image layer to use. One of:
#     - released      -> public IBM container registry base image
#     - authenticated -> containers.io base image
#     - local         -> local Docker base image
# $2: Node.js version. One of:
#     - 12
#     - 10
#     - 8
# $3: Linux distribution. One of:
#     - standard               -> (uses node:$version, that is, Debian)
#     - alpine                 -> (uses node:$version-alpine, that is, Alpine, and installs build dependencies)
#     - alpine-no-build-deps   -> (uses node:$version-alpine, that is, Alpine, and does not install build dependencies)
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
  pushd ../instana-aws-fargate > /dev/null
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

echo "Building $dockerfile -> $image_tag (INSTANA_LAYER: $INSTANA_LAYER, NODEJS_VERSION: $NODEJS_VERSION)"
docker build \
  --progress=plain \
  --build-arg NODEJS_VERSION=$NODEJS_VERSION \
  --build-arg INSTANA_LAYER=$INSTANA_LAYER \
  -f $dockerfile \
  -t $image_tag \
  -t $ecr_repository/$image_tag \
  .
echo "docker build exit status: $?"

