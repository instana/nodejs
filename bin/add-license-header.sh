#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. 2021
#######################################

set -eo pipefail

cd `dirname $BASH_SOURCE`/..

fd --extension sh \
  --exclude add-header-js.sh \
  --exclude add-header-shell.sh \
  --exclude add-license-header.sh \
  --exec bash -c 'fileCreationYear=$(git log --name-only --pretty="format:" --follow {} | sort -u | xargs git log --reverse --date="format:%Y" --pretty=format:%ad -- | head -n1); bin/add-header-shell.sh {} $fileCreationYear'

fd --extension js \
  --exec bash -c 'fileCreationYear=$(git log --name-only --pretty="format:" --follow {} | sort -u | xargs git log --reverse --date="format:%Y" --pretty=format:%ad -- | head -n1); bin/add-header-js.sh {} $fileCreationYear'

