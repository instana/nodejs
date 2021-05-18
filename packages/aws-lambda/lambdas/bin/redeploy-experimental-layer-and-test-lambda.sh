#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. and contributors 2019
#######################################

set -eEuo pipefail

cd `dirname $BASH_SOURCE`/..

pwd

AWS_ACCNT=410797082306
REGION=us-east-2
LAYER_NAME=experimental-instana-nodejs-with-extension
PREVIOUS_LAYER_VERSION=$(AWS_PAGER="" aws --region $REGION --output json lambda list-layer-versions --layer-name $LAYER_NAME | jq '.LayerVersions[0].Version')
LAYER_VERSION=$((PREVIOUS_LAYER_VERSION + 1))

echo "Layer name: $LAYER_NAME"
echo "Previous version: $PREVIOUS_LAYER_VERSION"
echo "Next version: $LAYER_VERSION"

echo "Building and publishing new layer version:"

SKIP_DOCKER_IMAGE=true BBUILD_LAYER_WITH=local LAYER_NAME=$LAYER_NAME ../layer/bin/publish-layer.sh

echo "Re-Building and deploying test Lambda:"
BUILD_LAMBDAS_WITH=layer LAYER_VERSION=$LAYER_VERSION LAYER_ARN=arn:aws:lambda:$REGION:$AWS_ACCNT:layer:$LAYER_NAME:$LAYER_VERSION bin/rebuild-redeploy-single.sh simple-nodejs-lambda

echo "Done!"

