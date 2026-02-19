#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. and contributors 2019
#######################################

set -eEuo pipefail

cd $(dirname $BASH_SOURCE)/.. && pwd

pushd .. >/dev/null

if [[ -z "${1-}" ]]; then
  echo "Usage $0 <lambda-folder-name>"
  echo
  echo "The mandatory argument <lambda-folder-name> is missing."
  exit 1
fi

rm -rf instana-serverless*.tgz
rm -rf instana-aws-lambda*.tgz

# Specify one of:
# - BUILD_LAMBDAS_WITH=local
# - BUILD_LAMBDAS_WITH=npm
# - BUILD_LAMBDAS_WITH=layer
# See ../README.md for details.

echo
echo NOTE: When switching between BUILD_LAMBDAS_WITH=layer on one hand and BUILD_LAMBDAS_WITH=npm or BUILD_LAMBDAS_WITH=local on the other hand, you might need to add \(or remove\) instana.wrap\(\) to \(from\) the individual Lambda handler functions!
echo

echo Building all local tar.gz files.

if [[ -z "${BUILD_LAMBDAS_WITH}" ]]; then
  echo "Environment variable BUILD_LAMBDAS_WITH has not been provided, assuming \"local\"."
  BUILD_LAMBDAS_WITH=local
fi

# We will want to install/uninstall local npm package tar files, which means we need to build them first. Note: Even for
# options BUILD_LAMBDAS_WITH=layer or BUILD_LAMBDAS_WITH=npm, we need to build the packages, because we for all three
# packages we will call "npm uninstall -S $package-name"  and if the package.json points to the tar file it needs
# to exist so npm can uninstall it and all its transitive dependencies.

version=$(jq -r '.version' package.json)

echo "Building local tar.gz for @instana/serverless."
cd ../serverless
npm --loglevel=warn pack
mv instana-serverless-${version}.tgz ../aws-lambda/instana-serverless.tgz

echo "Building local tar.gz for @instana/core."
cd ../core
npm --loglevel=warn pack
mv instana-core-${version}.tgz ../aws-lambda/instana-core.tgz

echo "Building local tar.gz for @instana/aws-lambda."
cd ../aws-lambda
npm --loglevel=warn pack
mv instana-aws-lambda-${version}.tgz instana-aws-lambda.tgz

echo "Building local tar.gz for instana-aws-lambda-auto-wrap."
cd ../aws-lambda-auto-wrap
npm --loglevel=warn pack
mv instana-aws-lambda-auto-wrap-${version}.tgz ../aws-lambda/instana-aws-lambda-auto-wrap.tgz
cd ../aws-lambda

if [[ "${BUILD_LAMBDAS_WITH}" == "npm" ]]; then
  echo "Building Lambda zip file(s) with the latest npm packages."
elif [[ "${BUILD_LAMBDAS_WITH}" == "local" ]]; then
  echo "Building Lambda zip file(s) with the local tar.gz files."
elif [[ "$BUILD_LAMBDAS_WITH" == "layer" ]]; then
  echo "Building Lambda zip file(s) without @instana/aws-lambda, assuming the AWS Lambda layer \"instana-nodejs\" is (or will be) configured."
else
  echo "Unknown option for BUILD_LAMBDAS_WITH: $BUILD_LAMBDAS_WITH"
  echo Aborting.
  exit 1
fi

popd >/dev/null

echo "Creating $1.zip with build option $BUILD_LAMBDAS_WITH."

lambda_directory=$1
if [[ -d "$lambda_directory" && ! -L "$lambda_directory" && -e "$lambda_directory/bin/create-zip.sh" ]]; then
  BUILD_LAMBDAS_WITH=$BUILD_LAMBDAS_WITH $lambda_directory/bin/create-zip.sh
else
  echo "Cannot create zip file for $lambda_directory, either the directory does not exist or is a symlink or it has no bin/create-zip.sh script."
fi

echo
echo NOTE: When switching between BUILD_LAMBDAS_WITH=layer on one hand and BUILD_LAMBDAS_WITH=npm or BUILD_LAMBDAS_WITH=local on the other hand, you might need to add \(or remove\) instana.wrap\(\) to \(from\) the individual Lambda handler functions!
echo
