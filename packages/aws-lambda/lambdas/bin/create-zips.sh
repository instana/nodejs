#!/usr/bin/env bash
set -eEuo pipefail

cd `dirname $BASH_SOURCE`/..

pushd .. > /dev/null
pwd
rm -rf instana-aws-lambda*.tgz

# Specify one of:
# - BUILD_LAMBDAS_WITH=local
# - BUILD_LAMBDAS_WITH=npm
# - BUILD_LAMBDAS_WITH=layer
# See ../README.md for details.


# Note: ${BUILD_LAMBDAS_WITH-xyz} -> default expansion with default xyz, to avoid bash error "unbound variable"
# when set -u is active.

if [[ -z "${BUILD_LAMBDAS_WITH-}" ]]; then
  echo "Environmant variable BUILD_LAMBDAS_WITH has not been provided, assuming \"npm\" (build with latest npm package)."
fi


# We will want to install/uninstall local npm package tar file, which means we need to build it first. Note: Even for
# options BUILD_LAMBDAS_WITH=layer or BUILD_LAMBDAS_WITH=npm, we need to build the package, because we will call
# "npm uninstall -S @instana/aws-lambda" and if the package.json points to the tar file it needs to exist so npm can
# uninstall it and all its transitive dependencies.
echo "Building local tar.gz."
npm --loglevel=warn pack
mv instana-aws-lambda-1*.tgz instana-aws-lambda.tgz

echo "Building local auto-wrap tar.gz."
cd ../aws-lambda-auto-wrap
npm --loglevel=warn pack
mv instana-aws-lambda-auto-wrap*.tgz ../aws-lambda/instana-aws-lambda-auto-wrap.tgz
cd ../aws-lambda

if [[ "${BUILD_LAMBDAS_WITH-npm}" == "npm" ]]; then
  echo "Building all Lambda zips with the latest npm packages."
elif [[ "${BUILD_LAMBDAS_WITH-}" == "local" ]]; then
  echo "Building all Lambda zips with the local tar.gz files."
elif [[ "$BUILD_LAMBDAS_WITH" == "layer" ]]; then
  echo "Building all Lambda zips without @instana/aws-lambda, assuming the AWS Lambda layer \"instana\" is configured."
else
  echo "Unknown option for BUILD_LAMBDAS_WITH: $BUILD_LAMBDAS_WITH"
  echo Aborting.
  exit 1
fi

popd > /dev/null

for lambda_directory in */ ; do
  if [[ -d "$lambda_directory" && ! -L "$lambda_directory" && -e "$lambda_directory/bin/create-zip.sh" ]]; then
    echo "next directory: $lambda_directory"
    $lambda_directory/bin/create-zip.sh
  else
    echo "skipping directory: $lambda_directory"
  fi
done

