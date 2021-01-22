#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. 2020
#######################################

set -eo pipefail

cd `dirname $BASH_SOURCE`/../packages/collector

while [[ true ]]; do
  npm run test:debug
done
