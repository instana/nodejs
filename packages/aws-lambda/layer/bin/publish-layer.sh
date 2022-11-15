#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. and contributors 2019
#######################################

set -eo pipefail

command -v npm >/dev/null 2>&1 || {
  cat <<EOF >&2
Node.js (and in particular npm) needs to be installed but it isn't.

Aborting.
EOF
  exit 1
}

command -v aws >/dev/null 2>&1 || {
  cat <<EOF >&2
The AWS command line tool needs to be installed but it isn't. See https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-install.html or https://docs.aws.amazon.com/cli/latest/userguide/install-macos.html etc. for instructions.

Aborting.
EOF
  exit 1
}

command -v docker >/dev/null 2>&1 || {
  cat <<EOF >&2
Docker needs to be installed but it isn't.

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

command -v zip >/dev/null 2>&1 || {
  cat <<EOF >&2
The executable zip needs to be installed but it isn't.

Aborting.
EOF
  exit 1
}

cd `dirname $BASH_SOURCE`/..

if [[ -z $PACKAGE_VERSION ]]; then
  PACKAGE_VERSION=latest
fi

if [[ -z $LAMBDA_ARCHITECTURE ]]; then
  LAMBDA_ARCHITECTURE='x86_64'
fi

PACKAGE_NAMES="@instana/aws-lambda@$PACKAGE_VERSION instana-aws-lambda-auto-wrap@$PACKAGE_VERSION"

# The default layer name is instana-nodejs. If you want to push experimental changes under a different layer name, you
# can provide the LAYER_NAME environment variable for that purpose. If you build the layer from your local source files
# (BUILD_LAYER_WITH=local), you actually are obliged to provide a different layer name or set
# SKIP_AWS_PUBLISH_LAYER=true to skip publishing the layer to AWS.
if [[ -z $LAYER_NAME ]]; then
  LAYER_NAME=instana-nodejs
fi

if [[ -z $CONTAINER_REGISTRY ]]; then
  CONTAINER_REGISTRY=icr.io
fi

# The default image name is icr.io/instana/aws-lambda-nodejs. If you want to push experimental changes to a different
# repository or even a different registry, you can provide the DOCKER_IMAGE_NAME environment variable for that purpose.
# If you build the layer from your local source files (BUILD_LAYER_WITH=local), you actually are obliged to provide a
# different image name or set SKIP_DOCKER_IMAGE_PUSH=true to skip pushing the image.
if [[ -z $DOCKER_IMAGE_NAME ]]; then
  if [[ $BUILD_LAYER_WITH == local ]]; then
    DOCKER_IMAGE_NAME=instana-aws-lambda-nodejs-local
  elif [[ $BUILD_LAYER_WITH == npm ]] && [[ $LAYER_NAME == instana-nodejs ]]; then
      DOCKER_IMAGE_NAME=$CONTAINER_REGISTRY/instana/aws-lambda-nodejs
  else
    DOCKER_IMAGE_NAME=$CONTAINER_REGISTRY/instana/aws-lambda-nodejs-experimental
  fi
fi

if [[ -n $SKIP_DOCKER_IMAGE ]]; then
  # SKIP_DOCKER_IMAGE implies SKIP_DOCKER_IMAGE_PUSH
  SKIP_DOCKER_IMAGE_PUSH=true
fi

LICENSE=MIT
ZIP_PREFIX=instana-nodejs-layer


if [[ $LAMBDA_ARCHITECTURE == arm64 ]]; then
  LAYER_NAME=$LAYER_NAME-$LAMBDA_ARCHITECTURE
  ZIP_PREFIX=$ZIP_PREFIX-$LAMBDA_ARCHITECTURE
  DOCKER_IMAGE_NAME=$DOCKER_IMAGE_NAME-$LAMBDA_ARCHITECTURE  
fi

ZIP_NAME=$ZIP_PREFIX.zip
TMP_ZIP_DIR=tmp

if [[ -z $REGIONS ]]; then
  REGIONS=$'ap-northeast-1\nap-northeast-2\nap-south-1\nap-southeast-1\nap-southeast-2\nca-central-1\neu-central-1\neu-north-1\neu-west-1\neu-west-2\neu-west-3\nsa-east-1\nus-east-1\nus-east-2\nus-west-1\nus-west-2'
fi

echo "####"
echo "LAYER_NAME: $LAYER_NAME"
echo "ZIP_NAME: $ZIP_NAME"
echo "LAMBDA_ARCHITECTURE: $LAMBDA_ARCHITECTURE"
echo "SKIP_DOCKER_IMAGE: $SKIP_DOCKER_IMAGE"
echo "SKIP_DOCKER_IMAGE_PUSH: $SKIP_DOCKER_IMAGE_PUSH"
echo "DOCKER_IMAGE_NAME: $DOCKER_IMAGE_NAME"
echo "REGIONS: $REGIONS"
echo "PACKAGE_VERSION: $PACKAGE_VERSION"
echo "BUILD_LAYER_WITH: $BUILD_LAYER_WITH"
echo "SKIP_AWS_PUBLISH_LAYER: $SKIP_AWS_PUBLISH_LAYER"
echo "####"

if [[ -z $NO_PROMPT ]]; then
  while true; do      
      read -p "Do you wish to continue (yes or no)? " yn
      case $yn in
          [Yy]* ) echo "Let's go!"; break;;
          [Nn]* ) exit 1;;
          * ) echo "Please answer yes or no.";;
      esac
  done
fi

echo Will build Lambda layer with name \"$LAYER_NAME\".

if [[ -z $SKIP_DOCKER_IMAGE ]]; then
  echo Will build Docker image with name \"$DOCKER_IMAGE_NAME\".
  if [[ -z $SKIP_DOCKER_IMAGE_PUSH ]]; then
    if [[ -z $CONTAINER_REGISTRY_USER ]]; then
      echo Missing mandatory environment variable CONTAINER_REGISTRY_USER. Provide SKIP_DOCKER_IMAGE_PUSH=true if you do not want to push the container image.
      exit 1
    fi
    if [[ -z $CONTAINER_REGISTRY_PASSWORD ]]; then
      echo Missing mandatory environment variable CONTAINER_REGISTRY_PASSWORD. Provide SKIP_DOCKER_IMAGE_PUSH=true if you do not want to push the container image.
      exit 1
    fi
  else
    echo Docker image will be built but not pushed
  fi
else
  echo Building/pushing the Docker image will be skipped.
fi

if [[ -z $AWS_ACCESS_KEY_ID ]] || [[ -z $AWS_SECRET_ACCESS_KEY ]]; then
  echo Warning: AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY are not set. This might be okay if you have set up AWS authentication via other means. If not, the AWS cli commands to publish the layer will fail.
fi

echo "step 1/9: fetching AWS regions (skipping, using fixed list of regions for now)"

# Actually, this should give us the regions where the Lambda service is provided:
# REGIONS=$(aws ssm get-parameters-by-path --path /aws/service/global-infrastructure/services/lambda/regions --output text --query "Parameters[].Value" | tr '\t' '\n')
# But for some reason, publishing to all of these regions does not work. In particular, the
# following regions either require special authorization/subscription status or don't support Lambdas: ap-east-1 me-south-1 ap-northeast-3

if [[ -z $SKIP_AWS_PUBLISH_LAYER ]]; then
  echo Will publish to regions:
  echo "$REGIONS"
fi

echo "step 2/9: Prepare build enviornment"

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

  if [[ $LAYER_NAME == instana-nodejs ]] && [[ -z $SKIP_AWS_PUBLISH_LAYER ]]; then
    echo "Error: Rejecting request to publish a layer with local packages for default layer name: $LAYER_NAME. Please choose a different layer name (via the LAYER_NAME environment variable) to build experimental layer versions with local packages. Alternatively, disable publishing the Lambda layer with SKIP_AWS_PUBLISH_LAYER=true."
    exit 1
  fi
  if [[ $DOCKER_IMAGE_NAME == icr.io/instana/aws-lambda-nodejs ]] && [[ -z $SKIP_DOCKER_IMAGE_PUSH ]]; then
    echo "Error: Rejecting request to push a Docker image with local packages for the default image name: $DOCKER_IMAGE_NAME. Please choose a different docker image name (via the DOCKER_IMAGE_NAME environment variable) to build experimental layer container images with local packages. Alternatively, disable pushing the Docker image with SKIP_DOCKER_IMAGE_PUSH=true to only build it locally or disable building the Docker image altogether with SKIP_DOCKER_IMAGE=true."
    exit 1
  fi

  echo "step 3/9: building local(!) packages for experimental layer"

  # Move up to packages directory
  pushd ../../../.. > /dev/null

  echo "Building local tar.gz for @instana/core."
  cd core
  rm -rf instana-core-*.tgz
  npm --loglevel=warn pack
  mv instana-core-*.tgz $LAYER_WORKDIR/instana-core.tgz

  echo "Building local tar.gz for @instana/serverless."
  cd ../serverless
  rm -rf instana-serverless-*.tgz
  npm --loglevel=warn pack
  mv instana-serverless-*.tgz $LAYER_WORKDIR/instana-serverless.tgz

  echo "Building local tar.gz for @instana/aws-lambda."
  cd ../aws-lambda

  if [[ -n $REBUILD_LAMBDA_EXTENSION ]]; then
    echo "Rebuilding Lambda extension from local sources for @instana/aws-lambda."
    pushd ../../../lambda-extension > /dev/null
    make build
    popd > /dev/null
    cp ../../../lambda-extension/_build/extensions/$LAMBDA_ARCHITECTURE/instana-lambda-extension layer/include/$LAMBDA_ARCHITECTURE/instana-lambda-extension
  fi

  rm -rf instana-aws-lambda-*.tgz
  npm --loglevel=warn pack
  mv instana-aws-lambda-*.tgz $LAYER_WORKDIR/instana-aws-lambda.tgz

  echo "Building local tar.gz for instana-aws-lambda-auto-wrap."
  cd ../aws-lambda-auto-wrap
  rm -rf instana-aws-lambda-auto-wrap-*.tgz
  npm --loglevel=warn pack
  mv instana-aws-lambda-auto-wrap-*.tgz $LAYER_WORKDIR/instana-aws-lambda-auto-wrap.tgz

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
  echo "step 3/9: downloading packages from npm (version $PACKAGE_VERSION)"
  npm install $PACKAGE_NAMES
else
  echo "Invalid option for BUILD_LAYER_WITH: $BUILD_LAYER_WITH, terminating."
  exit 1
fi

VERSION=$(jq -r .version node_modules/@instana/aws-lambda/package.json)

echo "building layer with package version $VERSION"
rm -f package.json package-lock.json
cd ..

echo "step 4/9: Add extension to layer"
mkdir -p extensions

cp ../include/$LAMBDA_ARCHITECTURE/instana-lambda-extension extensions/instana-lambda-extension

# ES module support for AWS Lambda
# We copy the files manually, because we do not have to publish them to NPM
mkdir nodejs/node_modules/instana-aws-lambda-auto-wrap-esm
cp ../../../aws-lambda-auto-wrap/esm/index.js nodejs/node_modules/instana-aws-lambda-auto-wrap-esm
cp ../../../aws-lambda-auto-wrap/src/utils.js nodejs/node_modules/instana-aws-lambda-auto-wrap-esm

echo "step 5/9: creating local zip file with layer contents"
zip -qr $ZIP_PREFIX .
mv $ZIP_NAME ..
popd > /dev/null

if [[ -z $SKIP_AWS_PUBLISH_LAYER ]]; then
  echo "step 6/9: publishing $ZIP_NAME as AWS Lambda layer $LAYER_NAME to all regions"

  while read -r region; do
    echo " - publishing to region $region:"

    # See https://docs.aws.amazon.com/cli/latest/reference/lambda/publish-layer-version.html for documentation.
    # NOTE: --compatible-architectures $LAMBDA_ARCHITECTURE is not working in all regions.
    lambda_layer_version=$( \
      AWS_PAGER="" aws --region $region lambda publish-layer-version \
        --layer-name $LAYER_NAME \
        --description "Provides Instana tracing and monitoring for AWS Lambdas (@instana/aws-lambda@$VERSION)" \
        --license-info $LICENSE \
        --zip-file fileb://$ZIP_NAME \
        --output json \
        --compatible-runtimes nodejs10.x nodejs12.x nodejs14.x nodejs16.x \
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
else
  echo "step 6/9: publishing AWS Lambda layer $LAYER_NAME (skipping)"
fi

if [[ -z $SKIP_DOCKER_IMAGE ]]; then
  echo "step 7/9: building docker image for container image based Lambda layer"
  docker build . -t "$DOCKER_IMAGE_NAME:$VERSION"

  # NOTE: serverless/ci/pipeline.yaml passes PACKAGE_VERSION=1 for 1.x branch
  if [[ $PACKAGE_VERSION == latest ]]; then
    docker tag $DOCKER_IMAGE_NAME:$VERSION $DOCKER_IMAGE_NAME:latest
  fi

  if [[ -z $SKIP_DOCKER_IMAGE_PUSH ]]; then
    echo "step 8/9: pushing docker image for container image based Lambda layer"
    echo " - executing docker login:"
    docker login -u="$CONTAINER_REGISTRY_USER" -p="$CONTAINER_REGISTRY_PASSWORD" $CONTAINER_REGISTRY
    echo " - pushing Docker image $DOCKER_IMAGE_NAME:$VERSION now:"
    docker push $DOCKER_IMAGE_NAME:$VERSION

    if [[ $PACKAGE_VERSION == latest ]]; then
      echo " - pushing Docker image $DOCKER_IMAGE_NAME:latest now:"
      docker push $DOCKER_IMAGE_NAME:latest
    fi

    echo " - executing docker logout:"
    docker logout $CONTAINER_REGISTRY
  else
    echo "step 8/9: pushing docker image (skipping)"
  fi
else
  echo "step 7/9: building docker image (skipping)"
  echo "step 8/9: pushing docker image (skipping)"
fi

echo "step 9/9: cleaning up"
rm -rf $TMP_ZIP_DIR
rm -rf $ZIP_NAME
