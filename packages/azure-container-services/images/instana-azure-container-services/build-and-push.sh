#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2023
#######################################

# This script is used locally for building and pushing test versions of the container image.
# The production image on icr.io is built and published through Concourse (see serverless/ci/pipeline.yml).
# Note that the Dockerfile-npm and package.json.npm are used for the production image.

# Use cases for this script:
# - Build an Azure base container image from local sources, including modifications.
# - Build a base container image from an npm image without the "latest" dist tag (e.g., a release candidate npm package tagged with "next").
# - Test changes in Dockerfile or package.json for building the base container image.

# This script uploads the image directly to a remote Docker registry after building it. By default, we use an
# Azure container registry (configurable via .env).

# Parameters:
# - See ./build.sh for a detailed description of the parameters accepted by this script.

# Use -eox to display better output
set -eo pipefail

cd $(dirname $BASH_SOURCE)

source utils

if [[ ! -f .env ]]; then
  echo .env file is missing
  exit 1
fi
source .env

# Check required environment variables
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

npm_tag=$2

./build.sh $build_mode $npm_tag

setImageTag $image_tag_prefix $build_mode $npm_tag

echo "Pushing image $image_tag to $azure_repository"
docker push $azure_repository/$image_tag

# For npm build mode, push an additional image with the package version
if [[ $build_mode = npm ]]; then
  if [[ -n $npm_tag ]]; then
    package_version=$(npm show @instana/azure-container-services@$npm_tag version)
  else
    package_version=$(npm show @instana/azure-container-services version)
  fi
  echo npm package version: $package_version
  docker push $azure_repository/$image_tag_without_version:$package_version
fi
