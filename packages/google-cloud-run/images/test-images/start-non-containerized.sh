#!/usr/bin/env bash

set -eo pipefail

cd `dirname $BASH_SOURCE`

if [[ ! -f .env ]]; then
  echo .env file is missing
  exit 1
fi
source .env

INSTANA_ENDPOINT_URL=$instana_endpoint_url \
INSTANA_AGENT_KEY=$instana_agent_key \
INSTANA_DISABLE_CA_CHECK=$instana_disable_ca_check \
INSTANA_DEV_SEND_UNENCRYPTED=$instana_dev_send_unencrypted \
CUSTOM_METADATA_HOST=$metadata_v1 \
K_SERVICE=$k_service \
K_REVISION=$k_revision \
K_CONFIGURATION=$k_configuration \
PORT=$port \
INSTANA_LOG_LEVEL=$instana_log_level \
INSTANA_TIMEOUT=$instana_timeout \
node --require ../.. .

