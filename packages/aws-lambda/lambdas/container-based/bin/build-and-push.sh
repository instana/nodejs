#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. and contributors 2021
#######################################

set -eEuo pipefail

cd $(dirname $BASH_SOURCE)/..

if [[ ! -f .env ]]; then
  echo .env file is missing
  exit 1
fi

source .env

if [[ -z "${ecr_repository-}" ]]; then
  echo Please set ecr_repository in .env.
  exit 1
fi

image_tag=simple-container-image-based-nodejs-lambda
dockerfile=Dockerfile

echo "Building $dockerfile -> $image_tag"
docker build \
  -f $dockerfile \
  -t $image_tag \
  -t $ecr_repository/$image_tag \
  .

docker push $ecr_repository/$image_tag

echo "docker build exit status: $?"
