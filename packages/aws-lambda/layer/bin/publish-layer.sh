#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. and contributors 2019
#######################################

set -exo pipefail

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

PACKAGE_NAMES="@instana/aws-lambda instana-aws-lambda-auto-wrap"
LAYER_NAME=instana-nodejs
LICENSE=MIT
ZIP_PREFIX=instana-nodejs-layer
ZIP_NAME=$ZIP_PREFIX.zip
TMP_ZIP_DIR=tmp

echo "step 1/5: fetching AWS regions (skipping, using fixed list of regions for now)"

# Actually, this should give us the regions where the Lambda service is provided:
# REGIONS=$(aws ssm get-parameters-by-path --path /aws/service/global-infrastructure/services/lambda/regions --output text --query "Parameters[].Value" | tr '\t' '\n')
# But for some reason, publishing to all of these regions does not work. In particular, the
# following regions either require special authorization/subscription status or don't support Lambdas: ap-east-1 me-south-1 ap-northeast-3

REGIONS=$'ap-northeast-1\nap-northeast-2\nap-south-1\nap-southeast-1\nap-southeast-2\nca-central-1\neu-central-1\neu-north-1\neu-west-1\neu-west-2\neu-west-3\nsa-east-1\nus-east-1\nus-east-2\nus-west-1\nus-west-2'

echo Will publish to regions:
echo "$REGIONS"

rm -rf $ZIP_NAME
rm -rf $TMP_ZIP_DIR
mkdir -p $TMP_ZIP_DIR/nodejs
pushd $TMP_ZIP_DIR/nodejs > /dev/null

# We need a dummy package.json file, otherwise npm would think we want to install @instana/aws-lambda into
# packages/aws-lambda/node_modules.
cat <<EOF >> package.json
{
  "private":true
}
EOF

echo "step 2/5: downloading latest packages"
npm install $PACKAGE_NAMES
VERSION=$(jq -r .version node_modules/@instana/aws-lambda/package.json)
echo "downloaded version $VERSION"
rm -f package.json package-lock.json
cd ..

echo "step 3/5: creating local zip file with layer contents"
zip -qr $ZIP_PREFIX .
mv $ZIP_NAME ..
popd > /dev/null

echo "step 4/5: publishing $ZIP_NAME as AWS Lambda layer $LAYER_NAME to all regions"
while read -r region; do
  echo " - publishing to region $region:"
  # See https://docs.aws.amazon.com/cli/latest/reference/lambda/publish-layer-version.html for documentation.
  lambda_layer_version=$( \
    aws --region $region lambda publish-layer-version \
      --layer-name $LAYER_NAME \
      --description "Provides Instana tracing and monitoring for AWS Lambdas (@instana/aws-lambda@$VERSION)" \
      --license-info $LICENSE \
      --zip-file fileb://$ZIP_NAME \
      --output json \
      --compatible-runtimes nodejs8.10 nodejs10.x nodejs12.x nodejs14.x \
      | jq '.Version' \
  )
  echo "   + published version $lambda_layer_version to region $region"
  if [[ $lambda_layer_version =~ ^[0-9]+$ ]]; then
    echo "   + setting required permission on Lambda layer $LAYER_NAME / version $lambda_layer_version in region $region"
    aws --region $region lambda add-layer-version-permission \
      --layer-name $LAYER_NAME \
      --version-number $lambda_layer_version \
      --statement-id public-permission-all-accounts \
      --principal \* \
      --action lambda:GetLayerVersion \
      --output text
  else
    echo "   + WARNING: Lambda layer version $lambda_layer_version does not seem to be numeric, will not set permissions in region $region"
  fi

done <<< "$REGIONS"

echo "step 5/5: cleaning up"
rm -rf $TMP_ZIP_DIR
rm -rf $ZIP_NAME

