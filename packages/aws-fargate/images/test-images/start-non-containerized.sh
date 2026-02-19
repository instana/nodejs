#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. and contributors 2020
#######################################

set -eo pipefail

cd $(dirname $BASH_SOURCE)

if [[ ! -f .env ]]; then
  echo .env file is missing
  exit 1
fi
source .env

INSTANA_ENDPOINT_URL=$instana_endpoint_url \
  INSTANA_AGENT_KEY=$instana_agent_key \
  INSTANA_DISABLE_CA_CHECK=$instana_disable_ca_check \
  INSTANA_DEV_SEND_UNENCRYPTED=$instana_dev_send_unencrypted \
  ECS_CONTAINER_METADATA_URI=$metadata_v3 \
  INSTANA_LOG_LEVEL=$instana_log_level \
  INSTANA_TIMEOUT=$instana_timeout \
  node --require ../.. .
