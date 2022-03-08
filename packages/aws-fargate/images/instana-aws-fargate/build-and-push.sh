#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. and contributors 2020
#######################################

# This is a local script for testing the images.
# We use serverless/ci/pipeline.yml to publish the images. 

# use -eox to see better output
set -eo pipefail

cd `dirname $BASH_SOURCE`

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

npm_tag=$2

./build.sh $build_mode $npm_tag

setImageTag $image_tag_prefix $build_mode

if [[ -n $npm_tag ]]; then
  docker push $ecr_repository/$image_tag:$npm_tag
  echo "Pushing image $image_tag:$npm_tag to $ecr_repository"
else
  docker push $ecr_repository/$image_tag
  echo "Pushing image $image_tag to $ecr_repository"
fi

if [[ $build_mode = npm ]]; then
  if [[ -n $npm_tag ]]; then
    package_version=$(npm show @instana/aws-fargate@$npm_tag version)
  else
    package_version=$(npm show @instana/aws-fargate version)
  fi

  echo NPM Package Version $package_version

  docker push $ecr_repository/$image_tag:$package_version
fi
