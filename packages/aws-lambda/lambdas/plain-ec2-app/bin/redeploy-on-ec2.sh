#!/usr/bin/env bash
set -xeEuo pipefail

cd `dirname $BASH_SOURCE`/..

pkill -f node || true
if [[ -e .env ]]; then
  cp .env /tmp/demo-app-env-file
fi
rm -rf *
mv /tmp/demo-ec2-app.zip .
unzip -o demo-ec2-app.zip
rm demo-ec2-app.zip
cp /tmp/demo-app-env-file .env
npm install
bin/start.sh

