#!/usr/bin/env bash
set -eEuo pipefail
#######################################
# (c) Copyright IBM Corp. 2025
#######################################

cd $(dirname $BASH_SOURCE)/..

source ../bin/create-zip-util
createZip
