#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2023
#######################################

# This script builds a test image that can be used as an Azure container service.
# You can use the Instana Node.js Azure base image from various sources, such as a published production image,
# an image from your local Docker registry, or an image from an Azure container registry with pre-release images.
# You would usually not call this script directly but either use ./build-and-push.sh to push the built image
# to a registry for use in an actual Azure service or use ./build-and-run.sh to run it locally in a simulated Azure environment.

# Parameters:
# - $1: Instana Layer Mode, which Docker base image layer to use. Options:
#     - released  -> use an official production image from the public IBM container registry (icr.io)
#     - local     -> use a local Docker base image
#     - azure     -> use an image from the Azure container registry with test base images
# - $2: Node.js version. Options:
#     - 18
#     - 16
# - $3: Linux distribution. Options:
#     - standard             -> uses node:$version, Debian
#     - alpine               -> uses node:$version-alpine, Alpine, and installs build dependencies
#     - alpine-no-build-deps -> uses node:$version-alpine, Alpine, without installing build dependencies
# - $4: Docker Tag. Use a specific Docker tag instead of ":latest". Options:
#     - latest (default)
#     - any other Docker tag available in the registry referred to via $1/Instana Layer Mode.
#       Common use case: build a base image from a pre-release npm dist tag like "next" and publish it to
#       a pre-release Azure container registry with the tag "next".
#       Example: packages/azure-container-services/images/instana-azure-container-services/build.sh npm next
#                then use that pre-release base image here by specifying "next" for $4 as well.

# Use -eox to display better output
set -eo pipefail

cd $(dirname $BASH_SOURCE)

source utils

normalizeArgs $1 $2 $3 $4

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
  pushd ../instana-azure-container-services >/dev/null
  ./build.sh local
  popd >/dev/null
else
  echo Not building local Instana layer.
fi

setImageTag $image_tag_prefix $NODEJS_VERSION $LINUX_DISTRIBUTION $INSTANA_LAYER_MODE $DOCKER_TAG
setContainerName $container_name_prefix $NODEJS_VERSION $LINUX_DISTRIBUTION $INSTANA_LAYER_MODE $DOCKER_TAG

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
  -t $azure_repository/$image_tag \
  .
echo "docker build exit status: $?"
