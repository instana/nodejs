#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. and contributors 2021
#######################################

set -eo pipefail

time curl --silent "http://localhost:9000/2015-03-31/functions/function/invocations" -d '{}'
