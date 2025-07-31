#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2025
#######################################

cd "$(dirname "$0")/../../../../collector"
echo "Running npm pack in $(pwd)"
npm pack

version=$(node -p "require('./package.json').version")
tarball="instana-collector-${version}.tgz"
cp "./${tarball}" "./test/tracing/opentelemetry/collector.tgz"

cd "$(dirname "$0")/../core"
echo "Running npm pack in $(pwd)"
npm pack

version=$(node -p "require('./package.json').version")
tarball="instana-core-${version}.tgz"
cp "./${tarball}" "../collector/test/tracing/opentelemetry/core.tgz"