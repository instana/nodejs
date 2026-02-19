#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. and contributors 2019
#######################################

set -eEo pipefail

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

INSTANA_ENDPOINT_URL=$INSTANA_ENDPOINT_URL
INSTANA_AGENT_KEY=$INSTANA_AGENT_KEY
REGION=$REGION
TIMEOUT=$TIMEOUT
MEMORY_SIZE=$MEMORY_SIZE
HANDLER=$HANDLER
FUNCTION_NAME_PREFIX=$FUNCTION_NAME_PREFIX
lambda_zip_file=$1
ROLE_ARN=$ROLE_ARN
FUNCTION_URL=$FUNCTION_URL

if [[ -z $REGION ]]; then
  REGION=us-east-1
fi

if [[ -z $TIMEOUT ]]; then
  TIMEOUT=3
fi

if [[ -z $ROLE_ARN ]]; then
  ROLE_ARN=arn:aws:iam::767398002385:role/service-role/team-nodejs-lambda-role
fi

if [[ -z $FUNCTION_NAME_PREFIX ]]; then
  FUNCTION_NAME_PREFIX=teamnodejstracer-
fi

if [[ -z $HANDLER ]]; then
  HANDLER=index.handler
fi

if [[ -z $FUNCTION_URL ]]; then
  FUNCTION_URL=false
fi

if [[ -z $MEMORY_SIZE ]]; then
  MEMORY_SIZE=256
fi

if [[ -z $LAYER_ARN ]]; then
  LAYER_INFO=$(curl https://lambda-layers.instana.io/instana-nodejs?region=$REGION 2>/dev/null)
  LAYER_VERSION=$(echo $LAYER_INFO | jq .version)
  LAYER_ARN=$(echo $LAYER_INFO | jq .arn)
  # remove surrounding quotes from ARN as it trips up the aws lambda update-function-configuration command
  LAYER_ARN=${LAYER_ARN//\"/}
fi

if [[ ! -e $lambda_zip_file ]]; then
  echo "Zip file "$lambda_zip_file" does not exist, terminating. Usage: ./deploy-zip.sh <zip-file>"
  exit 1
fi

set +e
needs_layer=0
unzip -l $lambda_zip_file | grep node_modules/@instana/aws-lambda/package.json >/dev/null
needs_layer=$?
set -e

if [[ $needs_layer == 1 ]]; then
  HANDLER=instana-aws-lambda-auto-wrap.handler
fi

function_name=${lambda_zip_file%.zip}
function_name=${function_name##*/}
function_name="$FUNCTION_NAME_PREFIX-$function_name"

printf "\n#### Summary ####\n\n"
echo "ZIP FILE: $lambda_zip_file"
echo "FUNCTION NAME: $function_name"
echo "FUNCTION_NAME_PREFIX: $FUNCTION_NAME_PREFIX"
echo "REGION:: $REGION"
echo "FUNCTION URL: $FUNCTION_URL"
echo "HANDLER: $HANDLER"
echo "INSTANA_AGENT_KEY: $INSTANA_AGENT_KEY"
echo "INSTANA_ENDPOINT_URL: $INSTANA_ENDPOINT_URL"
echo "NEEDS LAYER: $needs_layer (yes: 1, no: 0)"
echo "LAYER_ARN: $LAYER_ARN"
echo "ROLE_ARN: $ROLE_ARN"
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

echo
echo "Found zip file: $lambda_zip_file"
echo Deploying zip $lambda_zip_file as function $function_name to region $REGION
echo

echo "Checking if function exists..."

if aws lambda get-function --function-name $function_name --region $REGION >/dev/null 2>&1; then
  echo "Function exists. Updating code..."
  AWS_PAGER="" aws lambda update-function-code \
    --function-name $function_name \
    --zip-file fileb://$lambda_zip_file \
    --region $REGION
else
  echo "Function does not exist. Creating function..."
  AWS_PAGER="" aws lambda create-function \
    --function-name $function_name \
    --runtime nodejs20.x \
    --role $ROLE_ARN \
    --handler $HANDLER \
    --memory-size $MEMORY_SIZE \
    --zip-file fileb://$lambda_zip_file \
    --region $REGION \
    --timeout $TIMEOUT \
    --environment "Variables={INSTANA_ENDPOINT_URL=$INSTANA_ENDPOINT_URL,INSTANA_AGENT_KEY=$INSTANA_AGENT_KEY}"
fi

if [[ $FUNCTION_URL == true ]]; then
  url_config=$(aws lambda get-function-url-config --function-name $function_name --region $REGION || true)

  if echo "$url_config" | grep -q "FunctionUrl"; then
    echo "Function URL already exists for this Lambda function. Skipping creation."
    echo $url_config
  else
    echo "Creating Function URL for the function..."
    aws lambda create-function-url-config \
      --function-name $function_name \
      --auth-type NONE \
      --region $REGION

    aws lambda add-permission \
      --function-name $function_name \
      --principal "*" \
      --statement-id "AllowPublicInvoke" \
      --action "lambda:InvokeFunctionUrl" \
      --region $REGION \
      --function-url-auth-type NONE

    url_config=$(aws lambda get-function-url-config --function-name $function_name --region $REGION 2>&1)
    echo $url_config
  fi
fi

echo
if [[ $needs_layer == 0 ]]; then
  echo "The zip file $lambda_zip_file seems to contain the package @instana/aws-lambda, so I won't add the Lambda layer to it. I'll check if it currently has a layer that needs to be removed."

  current_layers=$(AWS_PAGER="" aws --region $REGION lambda get-function-configuration \
    --function-name $function_name \
    --output json |
    jq ".Layers")

  if [[ "$current_layers" =~ ":instana-nodejs:" ]]; then
    echo "This lambda function definition currently has the Instana layer configured, removing it now. I'll also set the standard handler index.handler (just in in case the auto-wrap handler had been configured previously)."
    AWS_PAGER="" aws --region $REGION lambda update-function-configuration \
      --function-name $function_name \
      --layers [] \
      --handler index.handler
  else
    echo This lambda function definition does not use the Instana layer, doing nothing.
  fi

else
  echo "It appears $lambda_zip_file does not contain package @instana/aws-lambda, so I'll add the \"instana-nodejs\" Lambda layer to the function."

  # Current layers of the target function!
  current_layers=$(AWS_PAGER="" aws --region $REGION lambda get-function-configuration \
    --function-name $function_name \
    --output json |
    jq ".Layers")

  if [[ "$current_layers" =~ $LAYER_ARN ]]; then
    echo This lambda function definition already has the specified version of the Instana layer, doing nothing.
  else
    echo "This lambda function definition currently has no Instana layer at all, adding it now. I'll also set the auto-wrap handler."

    AWS_PAGER="" aws --region $REGION lambda update-function-configuration \
      --function-name $function_name \
      --layers $LAYER_ARN \
      --handler instana-aws-lambda-auto-wrap.handler
  fi
fi

echo
echo Done.
