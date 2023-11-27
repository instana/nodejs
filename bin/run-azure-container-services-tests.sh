#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2023
#######################################

set -eo pipefail

npx lerna exec "npm run test:debug" --scope=@instana/azure-container-services