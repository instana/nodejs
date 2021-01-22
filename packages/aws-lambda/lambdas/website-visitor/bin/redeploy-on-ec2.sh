#!/usr/bin/env bash
set -xu
#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. 2019
#######################################


mkdir -p /opt/website-visitor
cd /opt/website-visitor

if [[ -e .env ]]; then
  cp .env /tmp/website-visitor-env-file
fi

cd /opt/website-visitor
rm -rf *
cp /tmp/website-visitor.zip .
unzip -o website-visitor.zip
rm website-visitor.zip
cp /tmp/website-visitor-env-file .env
docker build --tag website-visitor .
docker stop website-visitor || true
docker rm website-visitor || true
docker run --name website-visitor -d website-visitor

