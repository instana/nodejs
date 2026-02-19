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
npm pack
version=$(node -p "require('./package.json').version")
cp "${COLLECTOR_DIR}/instana-collector-${version}.tgz" "${TGZ_DIR}/collector.tgz"

cd "${CORE_DIR}"
npm pack
version=$(node -p "require('./package.json').version")
cp "${CORE_DIR}/instana-core-${version}.tgz" "${TGZ_DIR}/core.tgz"

cd "${SHARED_METRICS_DIR}"
npm pack
version=$(node -p "require('./package.json').version")
cp "${SHARED_METRICS_DIR}/instana-shared-metrics-${version}.tgz" "${TGZ_DIR}/shared-metrics.tgz"

echo "[INFO] Packed instana tgz files into ${TGZ_DIR}"
ls -lh "${TGZ_DIR}"
