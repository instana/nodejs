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

dockerfile=Dockerfile-node-$LINUX_DISTRIBUTION-$NODEJS_VERSION
if [[ ! -f "$dockerfile" ]]; then
  echo "No Dockerfile for Node.js version $NODEJS_VERSION and distribution $LINUX_DISTRIBUTION, $dockerfile does not exist."
  exit 1
fi

pushd ../instana-aws-fargate > /dev/null
./build.sh
popd > /dev/null

setImageTag $image_tag_prefix $NODEJS_VERSION $LINUX_DISTRIBUTION
setContainerName $container_name_prefix $NODEJS_VERSION $LINUX_DISTRIBUTION

echo "Stopping and removing container $container_name"
docker rm -f $container_name || true

echo "Removing image $image_tag"
docker rmi -f $image_tag

echo "Building $dockerfile -> $image_tag"
docker build -f $dockerfile -t $image_tag -t $ecr_repository/$image_tag .
echo "docker build exit status: $?"

