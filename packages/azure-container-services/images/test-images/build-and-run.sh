#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2023
#######################################

# This script builds and runs a test image locally.
# You can use the Instanan Node.js Azure base image from various sources, such as a published production image,
# an image from your local Docker registry, or an image from an Azure container registry with pre-release images.

# Parameters:
# - ./build-and-run.sh <instana-layer-mode> <node-js-version> <linux-distribution> <docker-tag>
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
if [[ -z "${instana_endpoint_url-}" ]]; then
  echo Please set instana_endpoint_url in .env.
  exit 1
fi
if [[ -z "${instana_agent_key-}" ]]; then
  echo Please set instana_agent_key in .env.
  exit 1
fi

./build.sh $INSTANA_LAYER_MODE $NODEJS_VERSION $LINUX_DISTRIBUTION $DOCKER_TAG

setImageTag $image_tag_prefix $NODEJS_VERSION $LINUX_DISTRIBUTION $INSTANA_LAYER_MODE $DOCKER_TAG
setContainerName $container_name_prefix $NODEJS_VERSION $LINUX_DISTRIBUTION $INSTANA_LAYER_MODE $DOCKER_TAG

echo "Running container $container_name from image $image_tag (reporting to $instana_endpoint_url/$instana_agent_key)"
docker \
  run \
  --env INSTANA_ENDPOINT_URL=$instana_endpoint_url \
  --env INSTANA_AGENT_KEY=$instana_agent_key \
  --env INSTANA_DISABLE_CA_CHECK=$instana_disable_ca_check \
  --env INSTANA_DEV_SEND_UNENCRYPTED=$instana_dev_send_unencrypted \
  --env INSTANA_LOG_LEVEL=$instana_log_level \
  --env INSTANA_TIMEOUT=$instana_timeout \
  -p 4816:4816 \
  --name $container_name \
  $image_tag
