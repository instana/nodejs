#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. and contributors 2019
#######################################

set -eo pipefail

check_installation() {
  command -v "$1" >/dev/null 2>&1 || {
    cat <<EOF >&2
$1 needs to be installed but it isn't. Aborting.
EOF
    exit 1
  }
}

# Ensure required tools are installed.
check_installation npm
check_installation aws
check_installation docker
check_installation jq
check_installation zip

echo "Using AWS CLI version: $(aws --version)"

cd "$(dirname "$BASH_SOURCE")/.."

if [[ -z $PACKAGE_VERSION ]]; then
  PACKAGE_VERSION=latest
fi

if [[ -z $LAMBDA_ARCHITECTURE ]]; then
  LAMBDA_ARCHITECTURE='x86_64'
fi

if [[ -z $AWS_DEFAULT_REGION ]]; then
  export AWS_DEFAULT_REGION="us-east-1"
fi

if [[ -z $PUBLISH_TO_CHINA_REGIONS ]]; then
  PUBLISH_TO_CHINA_REGIONS=false
fi

PACKAGE_NAMES="@instana/aws-lambda@$PACKAGE_VERSION"

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

AWS_CLI_RETRY_MAX_ATTEMPTS=3
AWS_CLI_TIMEOUT_DEFAULT=100
AWS_CLI_TIMEOUT_FOR_CHINA=100

if [[ -z $AWS_ACCESS_KEY_ID ]] || [[ -z $AWS_SECRET_ACCESS_KEY ]]; then
  printf "Warning: Environment variables AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY are not set.\n"
  printf "This might be okay if you have set up AWS authentication via other means.\n"
  printf "If not, the AWS CLI commands will fail.\n"
fi

# The us-gov-* regions are only available to US government agencies, U.S. government etc. The regions have not been (and
# maybe cannot be) enabled for our AWS account. We currently do not publish Lambda layers to these regions.
SKIPPED_REGIONS=$'us-gov-east-1\nus-gov-west-1'

if [[ -z $REGIONS ]]; then
  printf "\nstep 1/9: Fetching AWS regions\n"
  REGIONS=$(aws ssm get-parameters-by-path --path /aws/service/global-infrastructure/services/lambda/regions --output text --query "Parameters[].Value" | tr '\t' '\n' | sort)
else
  # If REGIONS has been provided as an environment variable, we expect it to be a comma-separated list (as it is
  # cumbersome to provide a newline separated list via an environment variable). We need to convert this to a newline-
  # separated string, as this is what the remainder of this script expects.
  REGIONS=${REGIONS/,/$'\n'}
  printf "\nstep 1/9: Using provided AWS regions\n"
fi

# Separate regions into China and non-China groups.
# Lambda layers in China regions are published using a different AWS account.
REGIONS_CN=()
REGIONS_OTHERS=()
while IFS= read -r region; do
  if [[ $region == cn-* ]]; then
    REGIONS_CN+=("$region")
  else
    REGIONS_OTHERS+=("$region")
  fi
done <<<"$REGIONS"

if [[ "$PUBLISH_TO_CHINA_REGIONS" == "true" ]]; then
  REGIONS=("${REGIONS_CN[@]}")
else
  REGIONS=("${REGIONS_OTHERS[@]}")
fi

printf "\n#### Summary ####\n\n"
echo "LAYER_NAME: $LAYER_NAME"
echo "ZIP_NAME: $ZIP_NAME"
echo "LAMBDA_ARCHITECTURE: $LAMBDA_ARCHITECTURE"
echo "SKIP_DOCKER_IMAGE: $SKIP_DOCKER_IMAGE"
echo "DOCKER_IMAGE_NAME: $DOCKER_IMAGE_NAME"
echo "REGIONS: ${REGIONS[@]}"
echo "SKIPPED: $SKIPPED_REGIONS"
echo "CHINESE_REGIONS: ${REGIONS_CN[@]}"
echo "PACKAGE_VERSION: $PACKAGE_VERSION"
echo "PUBLISH_TO_CHINA_REGIONS: $PUBLISH_TO_CHINA_REGIONS"
echo "BUILD_LAYER_WITH: $BUILD_LAYER_WITH"
echo "SKIP_AWS_PUBLISH_LAYER: $SKIP_AWS_PUBLISH_LAYER"
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

# List of supported AWS Lambda Node.js runtimes
SUPPORTED_RUNTIMES="nodejs18.x nodejs20.x nodejs22.x nodejs24.x"

# The Node.js version to use for building the Docker image.
# This should be aligned with one of the supported runtimes above.
# We're using a development version.
ROOT_DIR=$(git rev-parse --show-toplevel 2>/dev/null || echo "../../..")
NVMRC_PATH="$ROOT_DIR/.nvmrc"
NODEJS_DEV_VERSION=$(cut -d '.' -f 1 "$NVMRC_PATH")
echo "Using Node.js version $NODEJS_DEV_VERSION from .nvmrc for Docker build"

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

echo "step 2/9: Prepare build environment"

rm -rf $ZIP_NAME
rm -rf $TMP_ZIP_DIR
LAYER_WORKDIR=$TMP_ZIP_DIR/nodejs
mkdir -p $LAYER_WORKDIR
pushd $LAYER_WORKDIR >/dev/null

# convert relative workdir path into absolute path
LAYER_WORKDIR=$(pwd)
echo Will build the layer in working directory: $LAYER_WORKDIR

# We need a dummy package.json file, otherwise npm would think we want to install @instana/aws-lambda into
# packages/aws-lambda/node_modules.
cat <<EOF >>package.json
{
  "private":true
}
EOF

build_and_install_aws_lambda_auto_wrap() {
  local current_dir=$(pwd)
  echo "Building and installing instana-aws-lambda-auto-wrap (internal package)."

  pushd "$ROOT_DIR/packages/aws-lambda-auto-wrap" >/dev/null
  rm -rf instana-aws-lambda-auto-wrap-*.tgz
  npm --loglevel=warn pack
  mv instana-aws-lambda-auto-wrap-*.tgz "$LAYER_WORKDIR/instana-aws-lambda-auto-wrap.tgz"
  popd >/dev/null

  cd "$LAYER_WORKDIR"
  npm install instana-aws-lambda-auto-wrap.tgz
  rm -rf instana-aws-lambda-auto-wrap.tgz
}

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
  pushd ../../../.. >/dev/null

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
    pushd ../../../lambda-extension >/dev/null
    make build
    popd >/dev/null
    cp ../../../lambda-extension/_build/extensions/$LAMBDA_ARCHITECTURE/instana-lambda-extension layer/include/$LAMBDA_ARCHITECTURE/instana-lambda-extension
  fi

  rm -rf instana-aws-lambda-*.tgz
  npm --loglevel=warn pack
  mv instana-aws-lambda-*.tgz $LAYER_WORKDIR/instana-aws-lambda.tgz

  popd >/dev/null

  # Install locally built packages (basically extracting them into node_modules) to prepare the structure that is
  # expected from an AWS Node.js Lambda layer.

  build_and_install_aws_lambda_auto_wrap

  npm install instana-aws-lambda.tgz
  npm install instana-serverless.tgz
  npm install instana-core.tgz
  rm -rf instana-aws-lambda.tgz
  rm -rf instana-serverless.tgz
  rm -rf instana-core.tgz

elif [[ $BUILD_LAYER_WITH == npm ]] || [[ -z $BUILD_LAYER_WITH ]]; then

  echo "step 3/9: downloading packages from npm (version $PACKAGE_VERSION)"
  npm install $PACKAGE_NAMES

  # internal package
  build_and_install_aws_lambda_auto_wrap
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
popd >/dev/null

export AWS_PAGER=""
export AWS_MAX_ATTEMPTS=$AWS_CLI_RETRY_MAX_ATTEMPTS

BUILD_SHOULD_FAIL=0

if [[ -z $SKIP_AWS_PUBLISH_LAYER ]]; then
  echo "step 6/9: publishing $ZIP_NAME as AWS Lambda layer $LAYER_NAME to specifed regions"

  for region in "${REGIONS[@]}"; do
    if [[ "$SKIPPED_REGIONS" == *"$region"* ]]; then
      echo "Skipping region: $region"
      continue
    fi

    echo Publishing AWS Lambda layer in region $region.

    aws_cli_timeout_options="--cli-connect-timeout $AWS_CLI_TIMEOUT_DEFAULT"

    if [[ "$PUBLISH_TO_CHINA_REGIONS" == "true" ]]; then

      if [[ -z $AWS_ACCESS_KEY_ID_CHINA ]] || [[ -z $AWS_SECRET_ACCESS_KEY_CHINA ]]; then
        printf "Error: Trying to publish to Chinese region $region, but at least one of the environment variables\n"
        printf "AWS_ACCESS_KEY_ID_CHINA or AWS_SECRET_ACCESS_KEY_CHINA is not set.\n"
        exit 1
      fi
      # Publishing to a Chinese regions requires different credentials, because it is a different AWS account.
      AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID_CHINA
      AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY_CHINA
      aws_cli_timeout_options="--cli-read-timeout $AWS_CLI_TIMEOUT_FOR_CHINA --cli-connect-timeout $AWS_CLI_TIMEOUT_FOR_CHINA"
    fi

    echo "   + using aws_cli_timeout_options: $aws_cli_timeout_options and retrying $AWS_CLI_RETRY_MAX_ATTEMPTS times"

    # See https://docs.aws.amazon.com/cli/latest/reference/lambda/publish-layer-version.html for documentation.
    # NOTE: --compatible-architectures $LAMBDA_ARCHITECTURE is not working in all regions.
    lambda_layer_version=$(
      aws \
        --region $region \
        $aws_cli_timeout_options \
        lambda \
        publish-layer-version \
        --layer-name $LAYER_NAME \
        --description "Provides Instana tracing and monitoring for AWS Lambdas (@instana/aws-lambda@$VERSION)" \
        --license-info $LICENSE \
        --zip-file fileb://$ZIP_NAME \
        --output json \
        --compatible-runtimes $SUPPORTED_RUNTIMES |
        jq '.Version'
    ) || true # NOTE: If the upload fails, the bash script should not fail.

    if [[ -z $lambda_layer_version ]] || [[ ! $lambda_layer_version =~ ^[0-9]+$ ]]; then
      echo "   + ERROR: Failed to publish layer in region $region, continuing to the next region."
      BUILD_SHOULD_FAIL=1
      continue
    fi

    echo "   + published version $lambda_layer_version to region $region"

    if [[ $lambda_layer_version =~ ^[0-9]+$ ]]; then
      echo "   + setting required permission on Lambda layer $LAYER_NAME / version $lambda_layer_version in region $region"
      aws \
        --region $region \
        $aws_cli_timeout_options \
        lambda \
        add-layer-version-permission \
        --layer-name $LAYER_NAME \
        --version-number $lambda_layer_version \
        --statement-id public-permission-all-accounts \
        --principal \* \
        --action lambda:GetLayerVersion \
        --output text
    else
      echo "   + WARNING: Lambda layer version $lambda_layer_version does not seem to be numeric, will not set permissions in region $region"
    fi
  done <<<"$REGIONS"
else
  echo "step 6/9: publishing AWS Lambda layer $LAYER_NAME (skipping)"
fi

# NOTE: We currently build and publish only x86-based images.
# Support for ARM-based images is not yet added.(TODO: INSTA-36216)
if [[ -z $SKIP_DOCKER_IMAGE ]]; then
  echo "Step 7/9: Building Docker image for Lambda layer targeting Node.js version $NODEJS_DEV_VERSION"

  # Build the Docker image for the specified Node.js version
  docker build --build-arg NODEJS_VERSION=$NODEJS_DEV_VERSION . -t "$DOCKER_IMAGE_NAME:$VERSION"

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

if [[ $BUILD_SHOULD_FAIL -eq 1 ]]; then
  echo "Error: At least one layer upload failed. Exiting with error code 1."
  exit 1
fi
