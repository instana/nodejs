#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2025
#######################################

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COLLECTOR_DIR="${SCRIPT_DIR}/../../collector"
CORE_DIR="${SCRIPT_DIR}/../../core"
SHARED_METRICS_DIR="${SCRIPT_DIR}/../../shared-metrics"
TEST_DIR="${SCRIPT_DIR}"
TGZ_DIR="${TEST_DIR}/instana-tgz"

mkdir -p "${TGZ_DIR}"

cd "${COLLECTOR_DIR}"
echo "Running npm pack in $(pwd)"
npm pack

version=$(node -p "require('./package.json').version")
tarball="instana-collector-${version}.tgz"
cp "${COLLECTOR_DIR}/${tarball}" "${TGZ_DIR}/collector.tgz"

cd "${CORE_DIR}"
echo "Running npm pack in $(pwd)"
npm pack

version=$(node -p "require('./package.json').version")
tarball="instana-core-${version}.tgz"
cp "${CORE_DIR}/${tarball}" "${TGZ_DIR}/core.tgz"

cd "${SHARED_METRICS_DIR}"
echo "Running npm pack in $(pwd)"
npm pack

version=$(node -p "require('./package.json').version")
tarball="instana-shared-metrics-${version}.tgz"
cp "${SHARED_METRICS_DIR}/${tarball}" "${TGZ_DIR}/shared-metrics.tgz"
