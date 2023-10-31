#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. and contributors 2020
#######################################

set -eo pipefail

cd `dirname $BASH_SOURCE`

if [[ ! -f inspector/.env ]]; then
  echo inspector/.env file is missing
  exit 1
fi
source inspector/.env

aws ecr get-login-password --region $region | docker login --username AWS --password-stdin $ecr_repository
