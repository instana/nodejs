#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. and contributors 2021
#######################################

set -eo pipefail

cd $(dirname $BASH_SOURCE)/..

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

REGIONS=$(aws ssm get-parameters-by-path --path /aws/service/global-infrastructure/services/lambda/regions --output text --query "Parameters[].Value" | tr '\t' '\n' | sort)

# us-gov-* only available to US government agencies, U.S. government etc.
# cn-* (china regions) completely disconnected from normal AWS account.
SKIPPED_REGIONS=$'cn-north-1\ncn-northwest-1\nus-gov-east-1\nus-gov-west-1'

while read -r region; do
  skip=0

  while read -r skip; do
    if [[ "$region" == "$skip" ]]; then
      skip=1
      break
    fi
  done <<<"$SKIPPED_REGIONS"

  if [[ $skip -eq 1 ]]; then
    echo "$region: skipped"
  else
    lambda_layer_version=$(
      AWS_PAGER="" aws --region $region \
        lambda list-layer-versions \
        --layer-name $LAYER_NAME \
        --output json |
        jq '.LayerVersions[0].Version'
    )

    echo $region: $lambda_layer_version
  fi
done <<<"$REGIONS"
