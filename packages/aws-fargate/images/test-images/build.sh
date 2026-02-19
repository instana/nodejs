#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. and contributors 2020
#######################################

# This script builds a test image that can be used as a Fargate task. You can either use the Instana
# Node.js Fargate base image from one of various sources (published production image, image from your local
# Docker registry, image from an AWS ECR registry with pre-release images). You would usually not call this script
# directly but either use ./build-and-push.sh to directly push the built image to a registry to use it in an actual
# Fargate task or use ./build-and-run.sh to run it locally in a simulated Fargate environment.

# ##############
# # Parameters #
# ##############
#
# $1: Instana Layer Mode, aka which Docker base image layer to use. One of:
#     - released      -> use an official production image from the public IBM container registry (icr.io)
#     - authenticated -> use an official production image from Instana's own registry (containers.instana.io);
#                        these are the very same images that are available from icr.io, but containers.instana.io
#                        requires authentication. See https://www.ibm.com/docs/en/obi/current?topic=agents-monitoring-aws-fargate#getting-the-nodejs-layer-from-containersinstanaio-instead
#     - local         -> use a local Docker base image
#     - aws           -> use an image from the AWS ECR registry with test base images
# $2: Node.js version. One of:
#     - 20
#     - 18
# $3: Linux distribution. One of:
#     - standard               -> (uses node:$version, that is, Debian)
#     - alpine                 -> (uses node:$version-alpine, that is, Alpine, and installs build dependencies)
#     - alpine-no-build-deps   -> (uses node:$version-alpine, that is, Alpine, and does not install build dependencies)
# $4: Docker Tag. Use a base image with a specific Docker tag instead of ":latest". One of:
#     - latest (this is the default)
#     - any other Docker tag that is available in the registry you are referring to via $1/Instana Layer Mode.
#       The most common use case would be to build a base image from a pre-release npm dist tag like "next" and publish
#       it to our pre-release AWS ECR registry with the tag "next" by doing
#       packages/aws-fargate/images/instana-aws-fargate/build.sh npm next
#       then using that pre-release base image here by specifying "next" for $4 as
#       well -> packages/aws-fargate/images/test-images/build.sh aws 18 standard next

# use -eox to see better output
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
  pushd ../instana-aws-fargate >/dev/null
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
  -t $ecr_repository/$image_tag \
  .
echo "docker build exit status: $?"
