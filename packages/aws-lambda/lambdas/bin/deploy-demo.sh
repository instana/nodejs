#!/usr/bin/env bash

set -eo pipefail

cd `dirname $BASH_SOURCE`/../zip

command -v aws >/dev/null 2>&1 || {
  cat <<EOF >&2
The AWS command line tool needs to be installed but it isn't. See https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-install.html or https://docs.aws.amazon.com/cli/latest/userguide/install-macos.html etc. for instructions.

Aborting.
EOF
  exit 1
}

REGION=us-east-2

for lambda_zip_file in demo-*.zip ; do
  echo
  echo Found zip file: $lambda_zip_file
  if [[ $lambda_zip_file == demo-ec2-app.zip ]]; then
    echo Skipping $lambda_zip_file.
    continue
  fi

  function_name=${lambda_zip_file%.zip}
  echo Deploying zip $lambda_zip_file as function $function_name to region $REGION

  aws --region $REGION lambda update-function-code \
    --function-name $function_name \
    --zip-file fileb://$lambda_zip_file

  # TODO Also add the latest layer to the function? Currently using the local packages which are usually build with
  # the local tgz.

done

echo
echo Done.
