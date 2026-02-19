#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2024
#######################################

set -eo pipefail

command -v aws >/dev/null 2>&1 || {
  cat <<EOF >&2
The AWS command line tool needs to be installed but it isn't. See https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-install.html or https://docs.aws.amazon.com/cli/latest/userguide/install-macos.html etc. for instructions.

Aborting.
EOF
  exit 1
}
command -v jq >/dev/null 2>&1 || {
  cat <<EOF >&2
The executable jq needs to be installed but it isn't.

Aborting.
EOF
  exit 1
}
command -v curl >/dev/null 2>&1 || {
  cat <<EOF >&2
The executable curl needs to be installed but it isn't.

Aborting.
EOF
  exit 1
}

LAYER_ARN=$LAYER_ARN
RELEASED=$RELEASED
INSTANA_ENDPOINT_URL=$INSTANA_ENDPOINT_URL
INSTANA_AGENT_KEY=$INSTANA_AGENT_KEY
REGION=$REGION
LAYER_NAME=$LAYER_NAME

if [[ -z $REGION ]]; then
  REGION=us-east-1
fi

if [[ -z $INSTANA_ENDPOINT_URL ]]; then
  echo "INSTANA_ENDPOINT_URL is not set. Aborting."
  exit 1
fi

if [[ -z $INSTANA_AGENT_KEY ]]; then
  echo "INSTANA_AGENT_KEY is not set. Aborting."
  exit 1
fi

if [[ -z $RELEASED ]]; then
  RELEASED=0
fi

# if RELEASED is 0
if [[ $RELEASED -eq 0 ]]; then
  FUNCTION_NAME_PREFIX=teamnodejstracer
  LAYER_NAME=experimental-instana-nodejs-with-extension
  LAYER_ARN="Will be set after upload..."
else
  FUNCTION_NAME_PREFIX=teamnodejstracer-released
  LAYER_NAME=instana-nodejs
  LAYER_ARN="Will be downloaded from AWS based on the REGION..."
fi

printf "\n#### Summary ####\n\n"
echo "LAYER NAME: $LAYER_NAME"
echo "REGION:: $REGION"
echo "LAYER_ARN: $LAYER_ARN"
echo "RELEASED: $RELEASED"
echo "FUNCTION_NAME_PREFIX: $FUNCTION_NAME_PREFIX"
echo "INSTANA_ENDPOINT_URL: $INSTANA_ENDPOINT_URL"
echo "INSTANA_AGENT_KEY: $INSTANA_AGENT_KEY"
printf "####\n\n"

if [[ -z $NO_PROMPT ]]; then
  while true; do
    read -p "Do you wish to continue (yes or no)? " yn
    case $yn in
    [Yy]*)
      echo "Let's go!"
      break
      ;;
    [Nn]*) exit 1 ;;
    *) echo "Please answer yes or no." ;;
    esac
  done
fi

cd ../lambdas
echo "Creating zip file for 'many-spans' lambda..."
BUILD_LAMBDAS_WITH=local bin/create-zip.sh many-spans

cd ../
cd ./layer/bin

if [[ $RELEASED -eq 0 ]]; then
  echo "Uploading experimental layer..."

  REGIONS=$REGION SKIP_DOCKER_IMAGE=true BUILD_LAYER_WITH=local LAYER_NAME=$LAYER_NAME ./publish-layer.sh
  LAYER_ARN=$(aws lambda list-layer-versions --layer-name $LAYER_NAME --region $REGION | jq -r '.LayerVersions[0].LayerVersionArn')

  echo "Layer ARN: $LAYER_ARN"
  echo "Deploying 'many-spans' lambda..."

  cd ../../
  cd ./lambdas
  FUNCTION_NAME_PREFIX=$FUNCTION_NAME_PREFIX TIMEOUT=60 FUNCTION_URL=true REGION=$REGION LAYER_ARN=$LAYER_ARN bin/deploy-zip.sh zip/many-spans.zip
  sleep 5
else
  echo "Using released layer..."
  echo "Deploying 'many-spans' lambda..."

  cd ../../
  cd ./lambdas
  unset $LAYER_ARN
  FUNCTION_NAME_PREFIX=$FUNCTION_NAME_PREFIX TIMEOUT=60 FUNCTION_URL=true REGION=$REGION bin/deploy-zip.sh zip/many-spans.zip
  sleep 5
fi
