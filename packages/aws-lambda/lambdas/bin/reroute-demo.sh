#!/usr/bin/env bash

set -eEuo pipefail

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


REGION=us-east-2

if [[ -z "${NEW_INSTANA_ENDPOINT_URL-}" ]]; then
  echo Please provide NEW_INSTANA_ENDPOINT_URL as an environment variable. Aborting.
  exit 1
fi

if [[ -z ${NEW_INSTANA_AGENT_KEY-} ]]; then
  echo Please provide NEW_INSTANA_AGENT_KEY as an environment variable. Aborting.
  exit 1
fi

for lambda_directory in demo-* ; do
  if [[ ! -d $lambda_directory ]]; then
    continue
  fi

  echo
  echo Found lambda directory: $lambda_directory

  function_name=$lambda_directory
  echo Reading existing environment variables for function $function_name in region $REGION.

  new_variables=$(\
    aws --region $REGION lambda get-function-configuration \
      --function-name $function_name \
      --output json \
      | jq ".Environment.Variables + {INSTANA_ENDPOINT_URL:\"$NEW_INSTANA_ENDPOINT_URL\", INSTANA_AGENT_KEY:\"$NEW_INSTANA_AGENT_KEY\"}"
  )

  new_variables="{\"Variables\":$new_variables}"

  echo Writing updated environment variables: $new_variables

  aws --region $REGION lambda update-function-configuration \
    --function-name $function_name \
    --environment "$new_variables"

done

echo
echo Done.
