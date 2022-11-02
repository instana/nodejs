#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2022
#######################################

set -eo pipefail

lerna exec "npm run test:debug" --scope=instana-aws-lambda-auto-wrap

