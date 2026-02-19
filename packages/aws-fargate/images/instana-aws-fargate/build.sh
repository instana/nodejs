#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. and contributors 2020
#######################################

# This script is only used locally to build test versions of the container image. The production image on icr.io
# is built and published via Concourse, see serverless/ci/pipeline.yml. However, note that the files Dockerfile-npm and
# package.json.npm in this directory are used for the production image.
#
# The use cases for this script are:
# * Built a Fargate base container image from your local sources (including all local modifications), and
# * Building a base container image from an npm image that does not have the dist tag "latest", for example a
#   release candidate npm package tagged with "next".
# * Testing changes in the Dockerfile or package.json used for building the base container image.
#
# The images built by this script can either be used locally or pushed to a Docker registry, see ./build-and-push.sh for
# a script that includes uploading the image to a remote Docker registry.

# ##############
# # Parameters #
# ##############
#
# $1: Build mode:
#     - local: Builds the container image from your local machine, including all local modifications.
#     - npm: Downloads @instana/aws-fargate from the npm registry and puts that into the image. Local modifications or
#       commits not included in the release are ignored.
# $2: npm dist tag:
#     - latest (this is the default)
#     - any other dist tag that is available in the npm registry for @instana/aws-fargate.
#       The most common use case would be to build a base image from a pre-release npm dist tag like "next" for testing.

# use -eox to see better output
set -eo pipefail

cd $(dirname $BASH_SOURCE)

source utils

if [[ ! -f .env ]]; then
  echo .env file is missing
  exit 1
fi
source .env

if [[ -z "${image_tag_prefix-}" ]]; then
  echo Please set image_tag_prefix in .env.
  exit 1
fi
if [[ -z "${ecr_repository-}" ]]; then
  echo Please set ecr_repository in .env.
  exit 1
fi

build_mode=$1
if [[ -z "${build_mode-}" ]]; then
  build_mode=local
fi

# Use a dist-tag like "next" as the second parameter to build an image from a pre-release candidate.
npm_tag=$2
if [[ -z "${npm_tag-}" ]]; then
  npm_tag=latest
fi

echo Build Mode: ${build_mode}
echo npm Tag: ${npm_tag}

ROOT_DIR=$(git rev-parse --show-toplevel)
NVMRC_PATH="$ROOT_DIR/.nvmrc"
NODEJS_VERSION=$(cat "$NVMRC_PATH")

dockerfile=Dockerfile-$build_mode
build_arg=
setImageTag $image_tag_prefix $build_mode $npm_tag

echo "Building $image_tag from $dockerfile"

if [[ $build_mode = local ]]; then
  rm -rf instana-*.tgz

  pushd ../../../core >/dev/null
  rm -f instana-core-*.tgz
  npm pack
  mv instana-core-*.tgz ../aws-fargate/images/instana-aws-fargate/instana-core.tgz
  popd >/dev/null

  pushd ../../../serverless >/dev/null
  rm -f instana-serverless-*.tgz
  npm pack
  mv instana-serverless-*.tgz ../aws-fargate/images/instana-aws-fargate/instana-serverless.tgz
  popd >/dev/null

  pushd ../../../shared-metrics >/dev/null
  rm -f instana-shared-metrics-*.tgz
  npm pack
  mv instana-shared-metrics-*.tgz ../aws-fargate/images/instana-aws-fargate/instana-shared-metrics.tgz
  popd >/dev/null

  pushd ../../../metrics-util >/dev/null
  rm -f instana-metrics-util-*.tgz
  npm pack
  mv instana-metrics-util-*.tgz ../aws-fargate/images/instana-aws-fargate/instana-metrics-util.tgz
  popd >/dev/null

  pushd ../.. >/dev/null
  rm -f instana-aws-fargate-*.tgz
  npm pack
  mv instana-aws-fargate-*.tgz images/instana-aws-fargate/instana-aws-fargate.tgz
  popd >/dev/null

  cp package.json.local package.json
elif [[ $build_mode = npm ]]; then
  if [[ -n $npm_tag ]]; then
    package_version=$(npm show @instana/aws-fargate@$npm_tag version)
  else
    package_version=$(npm show @instana/aws-fargate version)
  fi
  echo npm package version $package_version

  build_arg="--build-arg package_version=$package_version"
else
  echo "Unknown option for build_mode: $build_mode"
  echo Aborting.
  exit 1
fi

echo "Removing images $image_tag_without_version and $image_tag"
docker rmi -f $image_tag_without_version
docker rmi -f $image_tag

build_arg="--build-arg NODEJS_VERSION=$NODEJS_VERSION $build_arg"

echo "Building $dockerfile -> $image_tag with $build_arg"

docker build --progress=plain $build_arg -f $dockerfile -t $image_tag -t $ecr_repository/$image_tag .
echo "docker build exit status: $?"

if [[ $build_mode = npm ]]; then
  # Add additional tags with the exact npm package version.
  docker tag $image_tag $image_tag_without_version:$package_version
  docker tag $ecr_repository/$image_tag $ecr_repository/$image_tag_without_version:$package_version
fi

rm -f package.json
