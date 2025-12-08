#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COLLECTOR_DIR="$REPO_ROOT/packages/collector"

echo "Repository root: $REPO_ROOT"

cd "$COLLECTOR_DIR"

echo "Removing existing instana-collector-*.tgz files..."
rm -f instana-collector-*.tgz

echo "Running npm pack in $COLLECTOR_DIR..."
TGZ_OUTPUT=$(npm pack --silent 2>/dev/null || true)
TGZ=$(echo "$TGZ_OUTPUT" | head -n1)

if [ -z "$TGZ" ] || [ ! -f "$TGZ" ]; then
  TGZ=$(ls -1t instana-collector-*.tgz 2>/dev/null | head -n1 || true)
fi

if [ -z "$TGZ" ] || [ ! -f "$TGZ" ]; then
  echo "ERROR: could not find generated .tgz file" >&2
  exit 1
fi

TMPDIR="/tmp/package.json-version"
rm -rf "$TMPDIR"
mkdir -p "$TMPDIR"

echo "Moving $TGZ to $TMPDIR/"
mv "$TGZ" "$TMPDIR/"

cd "$TMPDIR"

echo "Extracting $TGZ..."
tar -xzf "$TGZ"

cd package

echo "Installing production dependencies (omitting optional and dev)..."
npm install --omit=optional --omit=dev

if command -v node >/dev/null 2>&1; then
  VERSION=$(node -e "console.log(require('./package.json').version)")
else
  echo "ERROR: node is required to read package.json version" >&2
  exit 1
fi

ZIPNAME="instana-collector-${VERSION}-dev-only.zip"

echo "Creating zip $ZIPNAME..."
zip -r "$TMPDIR/$ZIPNAME" . >/dev/null

DEST="$HOME/dev/instana/zips-nodejs-tracer"
mkdir -p "$DEST"

echo "Moving $ZIPNAME to $DEST"
mv "$TMPDIR/$ZIPNAME" "$DEST/"

echo "Done. Zip is located at: $DEST/$ZIPNAME"

exit 0
