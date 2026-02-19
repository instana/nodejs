#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2024
#######################################

set -eo pipefail

REGION=$REGION

if [[ -z $REGION ]]; then
  REGION=us-east-1
fi

aws lambda delete-function-url-config --function-name teamnodejstracer-many-spans --region $REGION || true
aws lambda delete-function --function-name teamnodejstracer-many-spans --region $REGION || true
aws lambda delete-function-url-config --function-name teamnodejstracer-released-many-spans --region $REGION || true
aws lambda delete-function --function-name teamnodejstracer-released-many-spans --region $REGION || true
