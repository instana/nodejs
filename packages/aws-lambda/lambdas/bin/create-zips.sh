#!/usr/bin/env bash
set -eEuo pipefail

cd `dirname $BASH_SOURCE`/..

pushd .. > /dev/null
pwd
rm -rf instana-aws-lambda*.tgz
npm --loglevel=warn pack
mv instana-aws-lambda-*.tgz instana-aws-lambda.tgz
popd > /dev/null

for lambda_directory in */ ; do
  if [[ -d "$lambda_directory" && ! -L "$lambda_directory" && -e "$lambda_directory/bin/create-zip.sh" ]]; then
    echo "next directory: $lambda_directory"
    $lambda_directory/bin/create-zip.sh
  else
    echo "skipping directory: $lambda_directory"
  fi
done

