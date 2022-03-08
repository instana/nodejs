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

echo BUILD MODE ${build_mode}
echo NPM TAG ${npm_tag}

dockerfile=Dockerfile-$build_mode
build_arg=
setImageTag $image_tag_prefix $build_mode

echo "Building $image_tag from $dockerfile"

if [[ $build_mode = local ]]; then
  rm -rf instana-*.tgz

  pushd ../../../core > /dev/null
  rm -f instana-core-*.tgz
  npm pack
  mv instana-core-*.tgz ../aws-fargate/images/instana-aws-fargate/instana-core.tgz
  popd > /dev/null

  pushd ../../../serverless > /dev/null
  rm -f instana-serverless-*.tgz
  npm pack
  mv instana-serverless-*.tgz ../aws-fargate/images/instana-aws-fargate/instana-serverless.tgz
  popd > /dev/null

  pushd ../../../shared-metrics > /dev/null
  rm -f instana-shared-metrics-*.tgz
  npm pack
  mv instana-shared-metrics-*.tgz ../aws-fargate/images/instana-aws-fargate/instana-shared-metrics.tgz
  popd > /dev/null

  pushd ../../../metrics-util > /dev/null
  rm -f instana-metrics-util-*.tgz
  npm pack
  mv instana-metrics-util-*.tgz ../aws-fargate/images/instana-aws-fargate/instana-metrics-util.tgz
  popd > /dev/null

  pushd ../.. > /dev/null
  rm -f instana-aws-fargate-*.tgz
  npm pack
  mv instana-aws-fargate-*.tgz images/instana-aws-fargate/instana-aws-fargate.tgz
  popd > /dev/null

  cp package.json.local package.json
elif [[ $build_mode = npm ]]; then
  if [[ -n $npm_tag ]]; then
    package_version=$(npm show @instana/aws-fargate@$npm_tag version)
  else
    package_version=$(npm show @instana/aws-fargate version)
  fi

  echo NPM Package Version $package_version

  build_arg="--build-arg package_version=$package_version"
else
  echo "Unknown option for build_mode: $build_mode"
  echo Aborting.
  exit 1
fi

echo "Removing image $image_tag"
docker rmi -f $image_tag

echo "Building $dockerfile -> $image_tag"

if [[ -n $npm_tag ]]; then
  docker build --progress=plain $build_arg -f $dockerfile -t $image_tag:$npm_tag -t $ecr_repository/$image_tag:$npm_tag .
else
  docker build --progress=plain $build_arg -f $dockerfile -t $image_tag -t $ecr_repository/$image_tag .
fi

echo "docker build exit status: $?"

if [[ $build_mode = npm ]]; then
  if [[ -n $npm_tag ]]; then
    docker tag $image_tag:$npm_tag $image_tag:$package_version
    docker tag $ecr_repository/$image_tag:$npm_tag $ecr_repository/$image_tag:$package_version
  else
    docker tag $image_tag:latest $image_tag:$package_version
    docker tag $ecr_repository/$image_tag:latest $ecr_repository/$image_tag:$package_version
  fi  
fi

rm -f package.json
