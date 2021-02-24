#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. and contributors 2019
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

PACKAGE_NAMES="@instana/aws-lambda instana-aws-lambda-auto-wrap"
if [[ -z $LAYER_NAME ]]; then
  LAYER_NAME=instana-nodejs
fi
if [[ -z $DOCKER_IMAGE_NAME ]]; then
  DOCKER_IMAGE_NAME=instana/aws-lambda-nodejs
fi

LICENSE=MIT
ZIP_PREFIX=instana-nodejs-layer
ZIP_NAME=$ZIP_PREFIX.zip
TMP_ZIP_DIR=tmp

echo Will build Lambda layer with name \"$LAYER_NAME\".

REGIONS='ap-northeast-1\nap-northeast-2\nap-south-1\nap-southeast-1\nap-southeast-2\nca-central-1\neu-central-1\neu-north-1\neu-west-1\neu-west-2\neu-west-3\nsa-east-1\nus-east-1\nus-east-2\nus-west-1\nus-west-2'

if [[ -z $SKIP_DOCKER_IMAGE ]]; then
  echo Will build Docker image with name \"$DOCKER_IMAGE_NAME\".
else
  echo Building the Docker image will be skipped.
fi

echo "step 1/8: fetching AWS regions (skipping, using fixed list of regions for now)"

# Actually, this should give us the regions where the Lambda service is provided:
# REGIONS=$(aws ssm get-parameters-by-path --path /aws/service/global-infrastructure/services/lambda/regions --output text --query "Parameters[].Value" | tr '\t' '\n')
# But for some reason, publishing to all of these regions does not work. In particular, the
# following regions either require special authorization/subscription status or don't support Lambdas: ap-east-1 me-south-1 ap-northeast-3

echo Will publish to regions:
echo "$REGIONS"

echo "step 2/8: Prepare build enviornment"

rm -rf $ZIP_NAME
rm -rf $TMP_ZIP_DIR
LAYER_WORKDIR=$TMP_ZIP_DIR/nodejs
mkdir -p $LAYER_WORKDIR
pushd $LAYER_WORKDIR > /dev/null

# convert relative workdir path into absolute path
LAYER_WORKDIR=$(pwd)
echo Will build the layer in working directory: $LAYER_WORKDIR

# We need a dummy package.json file, otherwise npm would think we want to install @instana/aws-lambda into
# packages/aws-lambda/node_modules.
cat <<EOF >> package.json
{
  "private":true
}
EOF

if [[ $BUILD_LAYER_WITH == local ]]; then
  # Experimental layer build with local packages.

  if [[ $LAYER_NAME == instana-nodejs ]]; then
    echo "Error: Rejecting request to build a layer with local packages for default layer name: $LAYER_NAME. Please choose a different layer name (via the LAYER_NAME environment variable) to build experimental layer versions with local packages."
    exit 1
  fi
  if [[ -z $SKIP_DOCKER_IMAGE ]]; then
    if [[ $DOCKER_IMAGE_NAME == instana/aws-lambda-nodejs ]]; then
      echo "Error: Rejecting request to build a Docker image with local packages for default image name: $DOCKER_IMAGE_NAME. Please choose a different docker image name (via the DOCKER_IMAGE_NAME environment variable) to build experimental layer versions with local packages."
      exit 1
    fi
  fi

  echo "step 3/8: building local(!) packages for experimental layer"

  # Move up to packages directory
  pushd ../../../.. > /dev/null

  echo "Building local tar.gz for @instana/core."
  cd core
  npm --loglevel=warn pack
  mv instana-core-*.tgz $LAYER_WORKDIR/instana-core.tgz

  echo "Building local tar.gz for @instana/serverless."
  cd ../serverless
  npm --loglevel=warn pack
  mv instana-serverless-*.tgz $LAYER_WORKDIR/instana-serverless.tgz

  echo "Building local tar.gz for @instana/aws-lambda."
  cd ../aws-lambda
  npm --loglevel=warn pack
  mv instana-aws-lambda-1*.tgz $LAYER_WORKDIR/instana-aws-lambda.tgz

  echo "Building local tar.gz for instana-aws-lambda-auto-wrap."
  cd ../aws-lambda-auto-wrap
  npm --loglevel=warn pack
  mv instana-aws-lambda-auto-wrap*.tgz $LAYER_WORKDIR/instana-aws-lambda-auto-wrap.tgz

  popd > /dev/null

  # Install locally built packages (basically extracting them into node_modules) to prepare the structure that is
  # expected from an AWS Node.js Lambda layer.
  npm install instana-aws-lambda-auto-wrap.tgz
  npm install instana-aws-lambda.tgz
  npm install instana-serverless.tgz
  npm install instana-core.tgz
  rm -rf instana-aws-lambda-auto-wrap.tgz
  rm -rf instana-aws-lambda.tgz
  rm -rf instana-serverless.tgz
  rm -rf instana-core.tgz

elif [[ $BUILD_LAYER_WITH == npm ]] || [[ -z $BUILD_LAYER_WITH ]]; then
  echo "step 3/8: downloading latest packages from npm"
  npm install $PACKAGE_NAMES
else
  echo "Invalid option for BUILD_LAYER_WITH: $BUILD_LAYER_WITH, terminating."
  exit 1
fi

VERSION=$(jq -r .version node_modules/@instana/aws-lambda/package.json)

echo "building layer with package version $VERSION"
rm -f package.json package-lock.json
cd ..

echo "step 4/8: Add extension to layer"
mkdir -p extensions
cp ../include/instana-lambda-extension extensions/

echo "step 5/8: creating local zip file with layer contents"
zip -qr $ZIP_PREFIX .
mv $ZIP_NAME ..
popd > /dev/null

echo "step 6/8: publishing $ZIP_NAME as AWS Lambda layer $LAYER_NAME to all regions"
while read -r region; do
  echo " - publishing to region $region:"

  # See https://docs.aws.amazon.com/cli/latest/reference/lambda/publish-layer-version.html for documentation.
  lambda_layer_version=$( \
    AWS_PAGER="" aws --region $region lambda publish-layer-version \
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
    AWS_PAGER="" aws --region $region lambda add-layer-version-permission \
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

if [[ -z $SKIP_DOCKER_IMAGE ]]; then
  echo "step 7/8: building docker image for container image based Lambda layer"
  docker build . -t "$DOCKER_IMAGE_NAME"
  docker tag $DOCKER_IMAGE_NAME:latest $DOCKER_IMAGE_NAME:$VERSION
  echo " - pushing Docker image $DOCKER_IMAGE_NAME:"
  docker push $DOCKER_IMAGE_NAME:latest
  docker push $DOCKER_IMAGE_NAME:$VERSION
else
  echo "step 7/8: building docker images (skipping)"
fi

echo "step 8/8: cleaning up"
rm -rf $TMP_ZIP_DIR
rm -rf $ZIP_NAME
