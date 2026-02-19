#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. and contributors 2021
#######################################

set -eo pipefail

cd $(dirname $BASH_SOURCE)

source utils

normalizeArgs $1 $2

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

if [[ $INSTANA_LAYER_MODE = local ]]; then
  echo Building local Instana Lambda layer as a container image first.
  pushd ../../layer >/dev/null
  BUILD_LAYER_WITH=local \
    LAYER_NAME=instana-nodejs-$INSTANA_LAYER_MODE \
    REGIONS=us-east-2 \
    DOCKER_IMAGE_NAME=instana-aws-lambda-nodejs-local \
    SKIP_AWS_PUBLISH_LAYER=true \
    SKIP_DOCKER_IMAGE_PUSH=true \
    bin/publish-layer.sh
  popd >/dev/null
else
  echo Not building the local Instana Lambda layer.
fi

setImageTag $image_tag_prefix $NODEJS_VERSION $LINUX_DISTRIBUTION $INSTANA_LAYER_MODE
setContainerName $container_name_prefix $NODEJS_VERSION $LINUX_DISTRIBUTION $INSTANA_LAYER_MODE

echo "Stopping and removing container $container_name"
docker rm -f $container_name || true

echo "Removing image $image_tag"
docker rmi -f $image_tag

echo "Building -> $image_tag (INSTANA_LAYER: $INSTANA_LAYER, NODEJS_VERSION: $NODEJS_VERSION)"
docker build \
  --progress=plain \
  --build-arg LAMBDA_BASE_IMAGE=$LAMBDA_BASE_IMAGE \
  --build-arg INSTANA_LAYER=$INSTANA_LAYER \
  -t $image_tag \
  .

# To disable producing spans, either override CMD with "app.handler", or do not
# provide a value for either INSTANA_ENDPOINT_URL or INSTANA_AGENT_KEY.
echo ""
echo ""
echo "Running container $container_name from image $image_tag (reporting to $instana_endpoint_url/$instana_agent_key)"
docker run \
  --env INSTANA_DISABLE_CA_CHECK=$instana_disable_ca_check \
  --env INSTANA_DEV_SEND_UNENCRYPTED=$instana_dev_send_unencrypted \
  --env INSTANA_LOG_LEVEL=$instana_log_level \
  --env INSTANA_LAMBDA_EXTENSION_LOG_LEVEL=$instana_lambda_extension_log_level \
  --env INSTANA_TIMEOUT=$instana_timeout \
  --env INSTANA_ENDPOINT_URL=$instana_endpoint_url \
  --env INSTANA_AGENT_KEY=$instana_agent_key
# Use the line below if you want to test ES modules. Also checkout the Dockerfile
#--env LAMBDA_HANDLER='esm/app.handler' \
--env LAMBDA_HANDLER=app.handler \
  -p 9000:8080 \
  --name $container_name \
  $image_tag
