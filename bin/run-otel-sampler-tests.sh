#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2022
#######################################

set -eo pipefail

npx lerna exec "pnpm run test:debug" --scope=@instana/opentelemetry-sampler