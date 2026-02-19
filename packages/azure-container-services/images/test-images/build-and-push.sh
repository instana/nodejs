#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2023
#######################################

# This script builds and pushes a test image that can be used as an Azure service.
# You can use the Instana Node.js Azure base image from various sources, such as a published production image,
# an image from your local Docker registry, or an image from an Azure container registry with pre-release images.

# Parameters:
# - ./build-and-push.sh <instana-layer-mode> <node-js-version> <linux-distribution> <docker-tag>
#   See ./build.sh for a more detailed description of the parameters that this script accepts.

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

./build.sh $INSTANA_LAYER_MODE $NODEJS_VERSION $LINUX_DISTRIBUTION $DOCKER_TAG

setImageTag $image_tag_prefix $NODEJS_VERSION $LINUX_DISTRIBUTION $INSTANA_LAYER_MODE $DOCKER_TAG

echo "Pushing image $image_tag to $azure_repository"
docker push $azure_repository/$image_tag
