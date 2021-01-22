#!/usr/bin/env bash
set -xeEuo pipefail
#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. 2019
#######################################


cd `dirname $BASH_SOURCE`/..

DEFAULT_DEMO_APP_HOSTNAME=aws-instana-agent-us-east-2
DEMO_APP_HOSTNAME="${1-}"

if [[ -z "$DEMO_APP_HOSTNAME" ]]; then
  echo "No host name has been provided via DEMO_APP_HOSTNAME, using default $DEFAULT_DEMO_APP_HOSTNAME."
  DEMO_APP_HOSTNAME=$DEFAULT_DEMO_APP_HOSTNAME
fi

bin/create-zip.sh
scp ../zip/demo-ec2-app.zip "$DEMO_APP_HOSTNAME:/tmp"
ssh $DEMO_APP_HOSTNAME 'bash -s' < bin/redeploy-on-ec2.sh
