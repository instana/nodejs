#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. and contributors 2021
#######################################

set -eo pipefail

cd `dirname $BASH_SOURCE`/..

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

if [[ -z $LAYER_NAME ]]; then
  LAYER_NAME=instana-nodejs
fi

REGIONS=$'ap-northeast-1\nap-northeast-2\nap-south-1\nap-southeast-1\nap-southeast-2\nca-central-1\neu-central-1\neu-north-1\neu-west-1\neu-west-2\neu-west-3\nsa-east-1\nus-east-1\nus-east-2\nus-west-1\nus-west-2'

while read -r region; do
  lambda_layer_version=$( \
    AWS_PAGER="" aws --region $region \
      lambda list-layer-versions \
      --layer-name $LAYER_NAME \
      --output json \
      | jq '.LayerVersions[0].Version' \
  )

  echo $region: $lambda_layer_version

done <<< "$REGIONS"

