#!/usr/bin/env bash

set -eEuo pipefail

cd `dirname $BASH_SOURCE`/../zip

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


REGION=us-east-2

for lambda_zip_file in demo-*.zip ; do
  echo
  echo Found zip file: $lambda_zip_file
  if [[ $lambda_zip_file == demo-ec2-app.zip ]]; then
    echo Skipping $lambda_zip_file.
    continue
  fi

  function_name=${lambda_zip_file%.zip}
  echo Deploying zip $lambda_zip_file as function $function_name to region $REGION
  echo

  aws --region $REGION lambda update-function-code \
    --function-name $function_name \
    --zip-file fileb://$lambda_zip_file

  set +e
  unzip -l $lambda_zip_file | grep node_modules/@instana/aws-lambda/package.json > /dev/null
  needs_layer=$?
  set -e

  echo
  if [[ $needs_layer == 0 ]]; then
    echo "The zip file $lambda_zip_file seems to contain the package @instana/aws-lambda, so I won't add the Lambda layer to it."
  else
    echo "It appears $lambda_zip_file does not contain package @instana/aws-lambda, so I'll check if the \"instana\" Lambda layer needs to be added to it."

    if [[ -z "${LAYER_VERSION-}" || -z "${LAYER_ARN-}" ]]; then
      echo "I just found out that I'm supposed to add the Instana layer to the function I have just deployed. But you neglected to provide either LAYER_VERSION or LAYER_ARN as an environment variable, so I do not know which layer version I should deploy or what the ARN of that layer version is. The lambda zip file I have just deployed will probably be in a broken state now. Please fix this manually or provide LAYER_VERSION and LAYER_ARN and run this script again."
      echo
      echo "For your convenience, here are the commands to figure out the latest layer:"
      echo "  aws --region $REGION lambda list-layer-versions --layer-name instana"
      echo "If this ^ gives you a NextToken, ask again with:"
      echo "  aws --region $REGION lambda list-layer-versions --layer-name instana --starting-token"
      echo "until you have seen all versions."
      echo Aborting.
      exit 1
    fi

    current_layers=$(aws --region $REGION lambda get-function-configuration \
        --function-name $function_name \
        --output json \
        | jq ".Layers")

    if [[ "$current_layers" =~ ":instana:" ]]; then
      if [[ "$current_layers" =~ ":instana:$LAYER_VERSION" ]]; then
        echo This lambda function definition already has the Instana layer in the specified version, doing nothing.
      else
        echo This lambda function definition already has the Instana layer in an outdated version, please fix this manually, doing nothing.
        # TODO Also remove Lambda layer if zip file contained @instana/aws-lambda
      fi
    else
      echo This lambda function definition currently has no Instana layer at all, adding it now.
      aws --region $REGION lambda update-function-configuration \
        --function-name $function_name \
        --layers "$LAYER_ARN"
    fi
  fi

done

echo
echo Done.
