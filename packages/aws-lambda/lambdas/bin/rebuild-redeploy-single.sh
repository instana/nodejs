#!/usr/bin/env bash
set -eEuo pipefail
#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. 2019
#######################################


cd `dirname $BASH_SOURCE`/..

bin/create-zips.sh $1
bin/deploy-demo.sh $1

