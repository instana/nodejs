#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2023
#######################################

set -eo pipefail

cd `dirname $BASH_SOURCE`/..
source ../../bin/add-to-package-lock
addToPackageLock package-lock.json @instana/core false
addToPackageLock package-lock.json @instana/serverless false