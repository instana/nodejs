#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. and contributors 2021
#######################################

set -eo pipefail

aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 767398002385.dkr.ecr.us-east-1.amazonaws.com
