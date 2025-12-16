#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Packages to pack
PACKAGES=("packages/collector" "packages/core" "packages/shared-metrics")

# staging dir for tgz files
# Try to name the staging dir using the collector package version; fall back to mktemp if not available
COLLECTOR_PKG_JSON="$REPO_ROOT/packages/collector/package.json"
if command -v node >/dev/null 2>&1 && [ -f "$COLLECTOR_PKG_JSON" ]; then
  COLLECTOR_VERSION=$(node -e "console.log(require(process.argv[1]).version)" "$COLLECTOR_PKG_JSON")
  STAGING_DIR="/tmp/instana-pack-${COLLECTOR_VERSION}"
  # avoid clobbering an existing dir by appending a timestamp
  if [ -d "$STAGING_DIR" ]; then
    STAGING_DIR="${STAGING_DIR}-$(date +%s)"
  fi
  mkdir -p "$STAGING_DIR"
else
  STAGING_DIR=$(mktemp -d "/tmp/instana-pack-XXXX")
fi
trap 'rm -rf "$STAGING_DIR"' EXIT

DEST="$HOME/dev/instana/zips-nodejs-tracer"
mkdir -p "$DEST"

# Pack all packages and move tgz files to STAGING_DIR
for PKG in "${PACKAGES[@]}"; do
  PKG_DIR="$REPO_ROOT/$PKG"
  echo "Packing package: $PKG_DIR"
  cd "$PKG_DIR"

  PKG_BASENAME=$(basename "$PKG_DIR")

  # remove previous tgz files in package dir
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

  # move and normalize name in staging dir
  STAGED_TGZ="$STAGING_DIR/${PKG_BASENAME}.tgz"
  mv "$TGZ" "$STAGED_TGZ"
  echo "Moved $TGZ to $STAGED_TGZ"
done

# Only unpack collector, then install its production deps
COLLECTOR_TGZ="$STAGING_DIR/collector.tgz"
if [ ! -f "$COLLECTOR_TGZ" ]; then
  echo "ERROR: collector tgz not found in staging dir" >&2
  exit 1
fi

TMPDIR=$(mktemp -d "/tmp/package-collector-XXXX")
echo "Using temp dir $TMPDIR"

echo "Copying $COLLECTOR_TGZ to $TMPDIR/"
cp "$COLLECTOR_TGZ" "$TMPDIR/"

cd "$TMPDIR"

echo "Extracting collector package..."
tar -xzf "$(basename "$COLLECTOR_TGZ")"

cd package

echo "Installing collector production dependencies (omitting optional and dev)..."
npm install --omit=optional --omit=dev

# Now install core and shared-metrics into the extracted collector via the tgz files
CORE_TGZ="$STAGING_DIR/core.tgz"
SHARED_TGZ="$STAGING_DIR/shared-metrics.tgz"

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
  echo "Installing core and shared-metrics from tgz files (omitting optional and dev)..."

  # Print the exact command that will be executed
  echo -n "Command: npm install --omit=optional --omit=dev"
  for _p in "${INSTALL_ARGS[@]}"; do
    echo -n " $_p"
  done
  echo

  # Execute the install using the array to preserve argument boundaries
  npm install --omit=optional --omit=dev "${INSTALL_ARGS[@]}"
else
  echo "No additional tgz packages to install"
fi

# Read version and name from package.json
if command -v node >/dev/null 2>&1; then
  VERSION=$(node -e "console.log(require('./package.json').version)")
  NAME=$(node -e "console.log(require('./package.json').name.replace('@instana/',''))")
else
  echo "ERROR: node is required to read package.json version" >&2
  rm -rf "$TMPDIR"
  exit 1
fi

# Allow a custom postfix passed as first script argument or via ZIP_POSTFIX env var
# Usage: ./create-preinstalled-zip.sh mypostfix
POSTFIX="${1:-${ZIP_POSTFIX:-}}"
if [ -n "$POSTFIX" ]; then
  ZIPNAME="instana-${NAME}-${VERSION}-dev-only-${POSTFIX}.zip"
else
  ZIPNAME="instana-${NAME}-${VERSION}-dev-only.zip"
fi

echo "Creating zip $ZIPNAME..."
zip -r "$TMPDIR/$ZIPNAME" . >/dev/null

echo "Moving $ZIPNAME to $DEST"
mv "$TMPDIR/$ZIPNAME" "$DEST/"

echo "Cleaning up $TMPDIR"
rm -rf "$TMPDIR"

echo "Done. Zip is located at: $DEST/$ZIPNAME"

exit 0
