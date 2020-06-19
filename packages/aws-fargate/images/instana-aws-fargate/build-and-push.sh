#!/usr/bin/env bash

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

./build.sh $build_mode

setImageTag $image_tag_prefix $build_mode

echo "Pushing image $image_tag to $ecr_repository"
docker push $ecr_repository/$image_tag

if [[ $build_mode = npm ]]; then
  package_version=$(npm show @instana/aws-fargate version)
  docker push $ecr_repository/$image_tag:$package_version
fi
