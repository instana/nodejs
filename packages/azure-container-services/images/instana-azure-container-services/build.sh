#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2023
#######################################

# This script is exclusively used locally for building test versions of the container image.
# The production image on icr.io is built and published via Concourse (see serverless/ci/pipeline.yml).
# Note that the Dockerfile-npm and package.json.npm are used for the production image.

# Use cases for this script:
# - Build an Azure base container image from local sources, including modifications.
# - Build a base container image from an npm image without the "latest" dist tag (e.g., a release candidate npm package tagged with "next").
# - Test changes in Dockerfile or package.json for building the base container image.

# The images built by this script can either be used locally or pushed to a Docker registry.
# See ./build-and-push.sh for a script that includes uploading the image to a remote Docker registry.

# Parameters:
# - $1: Build mode:
#     - local: Builds the container image from your local machine, including all local modifications.
#     - npm: Downloads @instana/azure-container-services from the npm registry and includes that in the image. Local modifications or
#       commits not included in the release are ignored.
#       The corresponding Dockerfile-npm and package.json.npm file are used for the production image.
# - $2: npm dist tag:
#     - latest (this is the default)
#     - any other dist tag that is available in the npm registry for @instana/azure-container-services.
#       The most common use case would be to build a base image from a pre-release npm dist tag like "next" for testing.

# Use -eox to display better output
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
if [[ -z "${azure_repository-}" ]]; then
  echo Please set azure_repository in .env.
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

dockerfile=Dockerfile-$build_mode

build_arg=
setImageTag $image_tag_prefix $build_mode $npm_tag

echo "Building $image_tag from $dockerfile"

if [[ $build_mode = local ]]; then
  # Remove existing local artifacts
  rm -rf instana-*.tgz

  # Pack and move core and serverless packages
  pushd ../../../core >/dev/null
  rm -f instana-core-*.tgz
  npm pack
  mv instana-core-*.tgz ../azure-container-services/images/instana-azure-container-services/instana-core.tgz
  popd >/dev/null

  pushd ../../../serverless >/dev/null
  rm -f instana-serverless-*.tgz
  npm pack
  mv instana-serverless-*.tgz ../azure-container-services/images/instana-azure-container-services/instana-serverless.tgz
  popd >/dev/null

  pushd ../.. >/dev/null
  rm -f instana-azure-container-services-*.tgz
  npm pack
  mv instana-azure-container-services-*.tgz images/instana-azure-container-services/instana-azure-container-services.tgz
  popd >/dev/null

  cp package.json.local package.json
# Handle npm build mode
elif [[ $build_mode = npm ]]; then
  if [[ -n $npm_tag ]]; then
    package_version=$(npm show @instana/azure-container-services@$npm_tag version)
  else
    package_version=$(npm show @instana/azure-container-services version)
  fi
  echo npm package version $package_version

  build_arg="--build-arg package_version=$package_version"
else
  echo "Unknown option for build_mode: $build_mode"
  echo Aborting.
  exit 1
fi

# Remove existing images
echo "Removing images $image_tag_without_version and $image_tag"
docker rmi -f $image_tag_without_version
docker rmi -f $image_tag

ROOT_DIR=$(git rev-parse --show-toplevel)
NVMRC_PATH="$ROOT_DIR/.nvmrc"
NODEJS_VERSION=$(cat "$NVMRC_PATH")

build_arg="--build-arg NODEJS_VERSION=$NODEJS_VERSION $build_arg"

# Build the Docker image
echo "Building $dockerfile -> $image_tag with $build_arg"

docker build --progress=plain $build_arg -f $dockerfile -t $image_tag -t $azure_repository/$image_tag .
echo "docker build exit status: $?"

if [[ $build_mode = npm ]]; then
  # Add additional tags with the exact npm package version.
  docker tag $image_tag $image_tag_without_version:$package_version
  docker tag $azure_repository/$image_tag $azure_repository/$image_tag_without_version:$package_version
fi
# Clean up
rm -f package.json
