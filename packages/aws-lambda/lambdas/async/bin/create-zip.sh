#!/usr/bin/env bash
set -eEuo pipefail
#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. and contributors 2019
#######################################

cd $(dirname $BASH_SOURCE)/..

source ../bin/create-zip-util
createZip
