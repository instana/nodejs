#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. 2019
#######################################

set -eo pipefail

cd `dirname $BASH_SOURCE`/../packages/autoprofile

npm run test:debug

