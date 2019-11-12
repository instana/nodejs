#!/usr/bin/env bash
set -eEuo pipefail

cd `dirname $BASH_SOURCE`/..

pushd .. > /dev/null
pwd
rm -rf instana-aws-lambda*.tgz

# Specify one of:
# - BUILD_LAMBDAS_WITH=local
#     Uses the local code from packages/aws-lambda to build the zips.
#     Heads up: @instana/serverless and @instana/core might still be used from node_modules and not from packages.
# - BUILD_LAMBDAS_WITH=npm
#     Uses the latest published npm package @instana/aws-lambda to build the zips.
# - BUILD_LAMBDAS_WITH=layer
#     Do not add @instana/aws-collector to the zip file, instead assume the Lambda function has the AWS Lambda layer
#     "instana" configured and do not add. Note: You still need to add the layer to the Lambda configuration, this
#     script will not take care of that.


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
mv instana-aws-lambda-*.tgz instana-aws-lambda.tgz

if [[ "${BUILD_LAMBDAS_WITH-npm}" == "npm" ]]; then
  echo "Building all Lambda zips with latest npm package."
elif [[ "${BUILD_LAMBDAS_WITH-}" == "local" ]]; then
  echo "Building all Lambda zips with local tar.gz."
elif [[ "$BUILD_LAMBDAS_WITH" == "layer" ]]; then
  echo "Building all Lambda zips without @instana/collector, assuming the AWS Lambda layer \"instana\" is configured."
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

