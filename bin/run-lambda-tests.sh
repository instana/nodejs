#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. and contributors 2019
#######################################

set -eo pipefail

npx lerna exec "pnpm run test:debug" --scope=@instana/aws-lambda

