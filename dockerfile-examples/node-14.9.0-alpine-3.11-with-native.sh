#!/usr/bin/env bash
set -e
#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. 2018
#######################################


source ./build-and-run
buildAndRun node-14.9.0-alpine-3.11-with-native

echo VARIANT $variant

