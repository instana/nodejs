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
PREINSTALLED_DIR="${TEST_DIR}/preinstalled-node-modules"

mkdir -p "${TGZ_DIR}"
mkdir -p "${PREINSTALLED_DIR}"

# Pack the main packages
cd "${COLLECTOR_DIR}"
npm pack

version=$(node -p "require('./package.json').version")
tarball="instana-collector-${version}.tgz"
cp "${COLLECTOR_DIR}/${tarball}" "${TGZ_DIR}/collector.tgz"

cd "${CORE_DIR}"
npm pack

version=$(node -p "require('./package.json').version")
tarball="instana-core-${version}.tgz"
cp "${CORE_DIR}/${tarball}" "${TGZ_DIR}/core.tgz"

cd "${SHARED_METRICS_DIR}"
npm pack

version=$(node -p "require('./package.json').version")
tarball="instana-shared-metrics-${version}.tgz"
cp "${SHARED_METRICS_DIR}/${tarball}" "${TGZ_DIR}/shared-metrics.tgz"

# Create a temporary directory for building preinstalled node_modules
TEMP_PREINSTALL_DIR=$(mktemp -d)
trap "rm -rf ${TEMP_PREINSTALL_DIR}" EXIT

cd "${TEMP_PREINSTALL_DIR}"

# Create a package.json with all Instana packages as a base
cat >package.json <<EOF
{
  "name": "instana-preinstalled",
  "dependencies": {
    "@instana/collector": "file:${TGZ_DIR}/collector.tgz",
    "@instana/core": "file:${TGZ_DIR}/core.tgz",
    "@instana/shared-metrics": "file:${TGZ_DIR}/shared-metrics.tgz"
  }
}
EOF

# Install and create a precompressed archive
echo "[INFO] Installing preinstalled node_modules..."
NPM_ARGS="--production --no-optional --no-audit --progress=false"
if [ -n "$NPM_CACHE" ]; then
  echo "[INFO] Using global cache: $NPM_CACHE"
  NPM_ARGS="$NPM_ARGS --cache $NPM_CACHE --prefer-offline"
fi
npm install $NPM_ARGS

echo "[INFO] Creating preinstalled node_modules archive..."
tar -czf "${PREINSTALLED_DIR}/node_modules.tar.gz" node_modules/

if [ -f "${PREINSTALLED_DIR}/node_modules.tar.gz" ]; then
  echo "[INFO] Successfully created preinstalled node_modules archive"
  ls -lh "${PREINSTALLED_DIR}/node_modules.tar.gz"
else
  echo "[ERROR] Failed to create preinstalled node_modules archive"
  exit 1
fi
