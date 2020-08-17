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
if [[ -z "${gcr_repository-}" ]]; then
  echo Please set gcr_repository in .env.
  exit 1
fi

build_mode=$1
if [[ -z "${build_mode-}" ]]; then
  build_mode=local
fi

dockerfile=Dockerfile-$build_mode
setImageTag $image_tag_prefix $build_mode

echo "Building $image_tag from $dockerfile"

if [[ $build_mode = local ]]; then
  rm -rf instana-*.tgz

  pushd ../../../core > /dev/null
  rm -f instana-core-*.tgz
  npm pack
  mv instana-core-*.tgz ../google-cloud-run/images/instana-google-cloud-run/instana-core.tgz
  popd > /dev/null

  pushd ../../../serverless > /dev/null
  rm -f instana-serverless-*.tgz
  npm pack
  mv instana-serverless-*.tgz ../google-cloud-run/images/instana-google-cloud-run/instana-serverless.tgz
  popd > /dev/null

  pushd ../../../shared-metrics > /dev/null
  rm -f instana-shared-metrics-*.tgz
  npm pack
  mv instana-shared-metrics-*.tgz ../google-cloud-run/images/instana-google-cloud-run/instana-shared-metrics.tgz
  popd > /dev/null

  pushd ../.. > /dev/null
  rm -f instana-google-cloud-run-*.tgz
  npm pack
  mv instana-google-cloud-run-*.tgz images/instana-google-cloud-run/instana-google-cloud-run.tgz
  popd > /dev/null

  cp package.json.local package.json
elif [[ $build_mode = npm ]]; then
  package_version=$(npm show @instana/google-cloud-run version)
  sed -e "s/VERSION/$package_version/g" package.json.npm > package.json
else
  echo "Unknown option for build_mode: $build_mode"
  echo Aborting.
  exit 1
fi

echo "Removing image $image_tag"
docker rmi -f $image_tag

echo "Building $dockerfile -> $image_tag"
docker build -f $dockerfile -t $image_tag -t $gcr_repository/$image_tag .
echo "docker build exit status: $?"

if [[ $build_mode = npm ]]; then
  docker tag $image_tag:latest $image_tag:$package_version
  docker tag $gcr_repository/$image_tag:latest $gcr_repository/$image_tag:$package_version
fi

rm -f package.json
