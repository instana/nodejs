#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. and contributors 2019
#######################################

set -eEuo pipefail

if [[ -z "${1-}" ]]; then
  echo "Usage $0 <lambda-folder-name>"
  echo
  echo "The mandatory argument <lambda-folder-name> is missing."
  exit 1
fi

cd $(dirname $BASH_SOURCE)/..

bin/create-zip.sh $1
bin/deploy-zip.sh $1
