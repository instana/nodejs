#!/usr/bin/env bash

set -eo pipefail

cd `dirname $BASH_SOURCE`

source utils

NODEJS_VERSION=$1
if [[ -z "${NODEJS_VERSION-}" ]]; then
  echo 'Missing parameter: Node.js version'
  exit 1
fi

LINUX_DISTRIBUTION=$2
if [[ -z "${LINUX_DISTRIBUTION-}" ]]; then
  LINUX_DISTRIBUTION=standard
fi

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

./build.sh $NODEJS_VERSION $LINUX_DISTRIBUTION

setImageTag $image_tag_prefix $NODEJS_VERSION $LINUX_DISTRIBUTION

echo "Pushing image $image_tag to $ecr_repository"
docker push $ecr_repository/$image_tag

