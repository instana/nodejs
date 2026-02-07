#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2025
#######################################

current_dir=$(pwd)

cd "$(dirname "$0")/../../../../collector"
echo "Running npm pack in $(pwd)"
npm pack

version=$(node -p "require('./package.json').version")
tarball="instana-collector-${version}.tgz"
cp "./${tarball}" $current_dir/collector.tgz

cd "$(dirname "$0")/../core"
echo "Running npm pack in $(pwd)"
npm pack

version=$(node -p "require('./package.json').version")
tarball="instana-core-${version}.tgz"
cp "./${tarball}" $current_dir/core.tgz
