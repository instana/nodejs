#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. and contributors 2020
#######################################

# This script is only used locally to build and push test versions of the container image. The production image on
# icr.io is built and published via Concourse, see serverless/ci/pipeline.yml. However, note that the files
# Dockerfile-npm, package.json.npm and setup.sh in this directory _are_ actually used for the production image.
#
# The use cases for this script are:
# * Built a Google Cloud Run base container image from your local sources (including all local modifications), and
# * Building a base container image from an npm image that does not have the dist tag "latest", for example a
#   release candidate npm package tagged with "next".
# * Testing changes in the Dockerfile or package.json used for building the base container image.
#
# This script will upload the image directly to a remote Docker registry after building it. By default, we use a
# Google Cloud containerregistry (this can be configured via .env).

# ##############
# # Parameters #
# ##############
#
# See ./build.sh for a detailed description of the parameters that this script accepts.

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
if [[ -z "${gcr_repository-}" ]]; then
  echo Please set gcr_repository in .env.
  exit 1
fi

build_mode=$1
if [[ -z "${build_mode-}" ]]; then
  build_mode=local
fi

npm_tag=$2

./build.sh $build_mode $npm_tag

setImageTag $image_tag_prefix $build_mode $npm_tag

echo "Pushing image $image_tag to $gcr_repository"
docker push $gcr_repository/$image_tag

if [[ $build_mode = npm ]]; then
  if [[ -n $npm_tag ]]; then
    package_version=$(npm show @instana/google-cloud-run@$npm_tag version)
  else
    package_version=$(npm show @instana/google-cloud-run version)
  fi
  echo npm package version: $package_version
  docker push $gcr_repository/$image_tag_without_version:$package_version
fi
