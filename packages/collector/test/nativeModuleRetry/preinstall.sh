#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2025
#######################################

cd "$(dirname "$0")/../../../collector"
echo "Running npm pack in $(pwd)"
npm pack

version=$(node -p "require('./package.json').version")
tarball="instana-collector-${version}.tgz"
cp "./${tarball}" "./test/nativeModuleRetry/collector.tgz"

cd "$(dirname "$0")/../core"
echo "Running npm pack in $(pwd)"
npm pack

version=$(node -p "require('./package.json').version")
tarball="instana-core-${version}.tgz"
cp "./${tarball}" "../collector/test/nativeModuleRetry/core.tgz"

cd "$(dirname "$0")/../shared-metrics"
echo "Running npm pack in $(pwd)"
npm pack

version=$(node -p "require('./package.json').version")
tarball="instana-shared-metrics-${version}.tgz"
cp "./${tarball}" "../collector/test/nativeModuleRetry/shared-metrics.tgz"
