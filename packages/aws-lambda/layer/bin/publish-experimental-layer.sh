#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. and contributors 2019
#######################################

set -eo pipefail

if [[ -z $LAYER_NAME ]]; then
  LAYER_NAME=experimental-instana-nodejs-with-extension
fi
if [[ -z $REGIONS ]]; then
  REGIONS=us-east-2
fi

cd $(dirname $BASH_SOURCE)

BUILD_LAYER_WITH=local \
  LAYER_NAME=$LAYER_NAME \
  NO_PROMPT=yes \
  REBUILD_LAMBDA_EXTENSION=yes \
  REGIONS=$REGIONS \
  SKIP_DOCKER_IMAGE=true \
  ./publish-layer.sh
