#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. and contributors 2020
#######################################

set -eo pipefail

aws ecr get-login-password --region us-east-2 | docker login --username AWS --password-stdin 410797082306.dkr.ecr.us-east-2.amazonaws.com
