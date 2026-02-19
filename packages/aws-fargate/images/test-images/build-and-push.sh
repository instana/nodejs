#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. and contributors 2020
#######################################

# This script builds and pushes a test image that can be used as a Fargate task. You can either the Instanan Node.js
# Fargate base image from one of various sources (published production image, image from your local Docker registry,
# image from an AWS ECR registry with pre-release images).

# ##############
# # Parameters #
# ##############
#
# ./build-and-push.sh <instana-layer-mode> <node-js-version> <linux-distribution> <docker-tag>
#
# See ./build.sh for a more details description of the parameters that this script accepts.

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

echo "Pushing image $image_tag to $ecr_repository"
docker push $ecr_repository/$image_tag
