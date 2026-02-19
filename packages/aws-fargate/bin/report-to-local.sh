#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. and contributors 2020
#######################################

set -eo pipefail

cd $(dirname $BASH_SOURCE)/../../..

echo "Using INSTANA_ENDPOINT_URL, INSTANA_AGENT_KEY from packages/aws-fargate/images/test-images/.env."
echo

echo "Run \"watch curl http://localhost:4816\" in a separate shell if you also want calls."
echo
echo

trap 'kill %1' SIGINT

node packages/aws-fargate/test/metadata_mock &

fd -e js | entr -r packages/aws-fargate/images/test-images/start-non-containerized.sh
