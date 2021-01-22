#!/usr/bin/env bash
set -xeEuo pipefail
#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. 2019
#######################################


mkdir -p /opt/demo-app
cd /opt/demo-app

pkill -f demo-app || true
if [[ -e .env ]]; then
  cp .env /tmp/demo-app-env-file
fi

cd /opt/demo-app
rm -rf *
cp /tmp/demo-ec2-app.zip .
unzip -o demo-ec2-app.zip
rm demo-ec2-app.zip
cp /tmp/demo-app-env-file .env
npm install
bin/start.sh

