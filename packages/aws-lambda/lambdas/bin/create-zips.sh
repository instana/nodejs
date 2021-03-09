#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. and contributors 2019
#######################################

set -eEuo pipefail

cd `dirname $BASH_SOURCE`/..

pushd .. > /dev/null
pwd
rm -rf instana-serverless*.tgz
rm -rf instana-aws-lambda*.tgz

# Specify one of:
# - BUILD_LAMBDAS_WITH=local
# - BUILD_LAMBDAS_WITH=npm
# - BUILD_LAMBDAS_WITH=layer
# See ../README.md for details.

# Note: ${BUILD_LAMBDAS_WITH-xyz} -> default expansion with default xyz, to avoid bash error "unbound variable"
# when set -u is active.

echo
echo NOTE: When switching between BUILD_LAMBDAS_WITH=layer on one hand and BUILD_LAMBDAS_WITH=npm or BUILD_LAMBDAS_WITH=local on the other hand, you might need to add \(or remove\) instana.wrap\(\) to \(from\) the individual Lambda handler functions!
echo

echo Building all local tar.gz files.

if [[ -z "${BUILD_LAMBDAS_WITH-}" ]]; then
  echo "Environmant variable BUILD_LAMBDAS_WITH has not been provided, assuming \"npm\" (build with latest npm package)."
fi

# We will want to install/uninstall local npm package tar files, which means we need to build them first. Note: Even for
# options BUILD_LAMBDAS_WITH=layer or BUILD_LAMBDAS_WITH=npm, we need to build the packages, because we for all three
# packages we will call "npm uninstall -S $package-name"  and if the package.json points to the tar file it needs
# to exist so npm can uninstall it and all its transitive dependencies.
echo "Building local tar.gz for @instana/serverless."
cd ../serverless
npm --loglevel=warn pack
mv instana-serverless-*.tgz ../aws-lambda/instana-serverless.tgz

echo "Building local tar.gz for @instana/aws-lambda."
cd ../aws-lambda
npm --loglevel=warn pack
mv instana-aws-lambda-1*.tgz instana-aws-lambda.tgz

echo "Building local tar.gz for instana-aws-lambda-auto-wrap."
cd ../aws-lambda-auto-wrap
npm --loglevel=warn pack
mv instana-aws-lambda-auto-wrap*.tgz ../aws-lambda/instana-aws-lambda-auto-wrap.tgz
cd ../aws-lambda

if [[ "${BUILD_LAMBDAS_WITH-npm}" == "npm" ]]; then
  echo "Building Lambda zip file(s) with the latest npm packages."
elif [[ "${BUILD_LAMBDAS_WITH-}" == "local" ]]; then
  echo "Building Lambda zip file(s) with the local tar.gz files."
elif [[ "$BUILD_LAMBDAS_WITH" == "layer" ]]; then
  echo "Building Lambda zip file(s) without @instana/aws-lambda, assuming the AWS Lambda layer \"instana-nodejs\" is (or will be) configured."
else
  echo "Unknown option for BUILD_LAMBDAS_WITH: $BUILD_LAMBDAS_WITH"
  echo Aborting.
  exit 1
fi

popd > /dev/null

if [[ -z "${1-}" ]]; then
  echo Creating *all* zip files.
  echo
  for lambda_directory in */ ; do
    if [[ -d "$lambda_directory" && ! -L "$lambda_directory" && -e "$lambda_directory/bin/create-zip.sh" ]]; then
      echo "next directory: $lambda_directory"
      $lambda_directory/bin/create-zip.sh
    else
      echo "skipping directory: $lambda_directory"
    fi
  done
else
  echo "Creating *only* $1.zip"
  lambda_directory=$1
  if [[ -d "$lambda_directory" && ! -L "$lambda_directory" && -e "$lambda_directory/bin/create-zip.sh" ]]; then
    $lambda_directory/bin/create-zip.sh
  else
    echo "Cannot create zip file for $lambda_directory, either the directory does not exist or is a symlink or it has no bin/create-zip.sh script."
  fi
fi

echo
echo NOTE: When switching between BUILD_LAMBDAS_WITH=layer on one hand and BUILD_LAMBDAS_WITH=npm or BUILD_LAMBDAS_WITH=local on the other hand, you might need to add \(or remove\) instana.wrap\(\) to \(from\) the individual Lambda handler functions!
echo

