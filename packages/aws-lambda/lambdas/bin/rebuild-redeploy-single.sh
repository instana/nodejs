#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. and contributors 2019
#######################################

set -eEuo pipefail

cd `dirname $BASH_SOURCE`/..

bin/create-zips.sh $1
bin/deploy-demo.sh $1

