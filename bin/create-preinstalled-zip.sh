#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PACKAGES=("packages/collector" "packages/core" "packages/shared-metrics")

COLLECTOR_PKG_JSON="$REPO_ROOT/packages/collector/package.json"

if command -v node >/dev/null 2>&1 && [ -f "$COLLECTOR_PKG_JSON" ]; then
  COLLECTOR_VERSION=$(node -e "console.log(require(process.argv[1]).version)" "$COLLECTOR_PKG_JSON")
fi

TMPDIR=$(mktemp -d "/tmp/collector-preinstalled-XXXX")
echo "Using temp dir $TMPDIR"

for PKG in "${PACKAGES[@]}"; do
  PKG_DIR="$REPO_ROOT/$PKG"
  echo "Packing package: $PKG_DIR"
  cd "$PKG_DIR"

  PKG_BASENAME=$(basename "$PKG_DIR")

  rm -f ${PKG_BASENAME}-*.tgz || true

  TGZ_OUTPUT=$(npm pack --silent 2>/dev/null || true)
  TGZ=$(echo "$TGZ_OUTPUT" | head -n1)

  if [ -z "$TGZ" ] || [ ! -f "$TGZ" ]; then
    TGZ=$(ls -1t ${PKG_BASENAME}-*.tgz 2>/dev/null | head -n1 || true)
  fi

  if [ -z "$TGZ" ] || [ ! -f "$TGZ" ]; then
    echo "ERROR: could not find generated .tgz file for $PKG" >&2
    exit 1
  fi

  # Move and normalize name in TMPDIR
  NORMALIZED_TGZ="$TMPDIR/${PKG_BASENAME}.tgz"
  mv "$TGZ" "$NORMALIZED_TGZ"
  echo "Moved $TGZ to $NORMALIZED_TGZ"
done

COLLECTOR_TGZ="$TMPDIR/collector.tgz"
if [ ! -f "$COLLECTOR_TGZ" ]; then
  echo "ERROR: collector tgz not found" >&2
  exit 1
fi

echo "Extracting collector package..."

tar -xzf "$COLLECTOR_TGZ" -C "$TMPDIR"

echo "Running: 'cd $TMPDIR/package'"
cd "$TMPDIR/package"

echo "Running: 'npm install --omit=optional --omit=dev' in $TMPDIR/package"
npm install --omit=optional --omit=dev

CORE_TGZ="$TMPDIR/core.tgz"
SHARED_TGZ="$TMPDIR/shared-metrics.tgz"

INSTALL_ARGS=()
if [ -f "$CORE_TGZ" ]; then
  INSTALL_ARGS+=("$CORE_TGZ")
else
  echo "WARNING: core tgz not found, skipping" >&2
fi
if [ -f "$SHARED_TGZ" ]; then
  INSTALL_ARGS+=("$SHARED_TGZ")
else
  echo "WARNING: shared-metrics tgz not found, skipping" >&2
fi

if [ ${#INSTALL_ARGS[@]} -gt 0 ]; then
  echo -n "Running: npm install --omit=optional --omit=dev ${INSTALL_ARGS[@]}"

  for _p in "${INSTALL_ARGS[@]}"; do
    echo -n " $_p"
  done
  echo

  npm install --omit=optional --omit=dev "${INSTALL_ARGS[@]}"
else
  echo "No additional tgz packages to install"
fi

if command -v node >/dev/null 2>&1; then
  VERSION=$(node -e "console.log(require('./package.json').version)")
  NAME=$(node -e "console.log(require('./package.json').name.replace('@instana/',''))")
else
  echo "ERROR: node is required to read package.json version" >&2
  rm -rf "$TMPDIR"
  exit 1
fi

POSTFIX="${2:-${ZIP_POSTFIX:-}}"
if [ -n "$POSTFIX" ]; then
  ZIPNAME="instana-${NAME}-${VERSION}-${POSTFIX}.zip"
else
  ZIPNAME="instana-${NAME}-${VERSION}.zip"
fi

echo "Running: 'zip -r $TMPDIR/package/$ZIPNAME .' in $TMPDIR/package"
zip -r "$TMPDIR/package/$ZIPNAME" . >/dev/null

echo "Done. Zip is located at: $TMPDIR/package/$ZIPNAME"

open "$TMPDIR"

exit 0
