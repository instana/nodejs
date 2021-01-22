#!/usr/bin/env bash
set -xeEuo pipefail
#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. 2019
#######################################


cd `dirname $BASH_SOURCE`/..

nohup bash -c "exec -a demo-app node ." &> demo-app.log &
