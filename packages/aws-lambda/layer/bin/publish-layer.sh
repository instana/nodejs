#!/usr/bin/env bash

set -eo pipefail

cd `dirname $BASH_SOURCE`/..

LAMBDA_DOCS_PAGE_PATH=../../../../docs/src/pages/ecosystem/aws-lambda/nodejs/index.md
UI_INSTALL_HELP=../../../../ui-client/packages/in-waiting-for-deployment/components/OnboardingWidget/content.js

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
      --compatible-runtimes nodejs10.x nodejs8.10 nodejs12.x \
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

    # Update documentation with latest version:
    if [[ -n $LAMBDA_DOCS_PAGE_PATH ]]; then
      if [[ -f $LAMBDA_DOCS_PAGE_PATH ]]; then
        echo "Updating: $LAMBDA_DOCS_PAGE_PATH"
        sed -i '' "s/arn:aws:lambda:$region:\([0-9]*\):layer:instana-nodejs:[0-9][0-9]*\` | v[0-9\.][0-9\.]* |/arn:aws:lambda:$region:\1:layer:instana-nodejs:$lambda_layer_version\` | v$VERSION |/g" $LAMBDA_DOCS_PAGE_PATH
        echo "Updated $LAMBDA_DOCS_PAGE_PATH – do not forget to commit and push that change."
      else
        echo "Not found: $LAMBDA_DOCS_PAGE_PATH. Will not update documenation."
      fi
    else
      echo "LAMBDA_DOCS_PAGE_PATH not set. Will not update documenation."
    fi

    # Update interactive install help with latest version:
    if [[ -n $UI_INSTALL_HELP ]]; then
      if [[ -f $UI_INSTALL_HELP ]]; then
        echo "Updating: $UI_INSTALL_HELP"
        sed -i '' "s/const layerVersion = \'[0-9][0-9]*\';/const layerVersion = \'$lambda_layer_version\';/g" $UI_INSTALL_HELP
        echo "Updated $UI_INSTALL_HELP – do not forget to commit and push that change."
      else
        echo "Not found: $UI_INSTALL_HELP. Will not update UI install help."
      fi
    else
      echo "UI_INSTALL_HELP not set. Will not update UI install help."
    fi


  else
    echo "   + WARNING: Lambda layer version $lambda_layer_version does not seem to be numeric, will not set permissions in region $region"
  fi

done <<< "$REGIONS"

echo "step 5/5: cleaning up"
rm -rf $TMP_ZIP_DIR
rm -rf $ZIP_NAME

