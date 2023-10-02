#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2022
#######################################

set -eo pipefail

npx lerna exec "npm run test:debug" --scope=@instana/opentelemetry-sampler