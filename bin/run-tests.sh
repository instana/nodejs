#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. and contributors 2018
#######################################

set -eo pipefail

cd `dirname $BASH_SOURCE`/..

npm run test:debug
