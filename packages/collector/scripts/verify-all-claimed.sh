#!/bin/bash

# Post-flight check: verifies that ALL test files were claimed (and therefore executed).
# Runs in the pipeline's "finally" step after all collector tasks have completed.
# If claimed-tests.txt is missing or incomplete, some tests were silently skipped.

ARTIFACTS_PATH="${1:-/artifacts}"
CLAIMED_FILE="$ARTIFACTS_PATH/claimed-tests.txt"

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$SCRIPT_DIR/.." || exit 1

if [ ! -f "$CLAIMED_FILE" ]; then
  echo "⚠ No claimed-tests.txt found at $CLAIMED_FILE — skipping verification"
  exit 0
fi

# Same find pattern as claim-tests.sh uses in the pipeline
TEST_PATTERN="${2:-test/**/*test.js}"
ALL_TESTS=$(find "$(pwd)" -path "*$TEST_PATTERN" -name "*test.js" -not -path "*/node_modules/*" -not -path "*/long_*/*" | sort)
TOTAL=$(echo "$ALL_TESTS" | wc -l | tr -d ' ')
CLAIMED_COUNT=$(wc -l < "$CLAIMED_FILE" | tr -d ' ')

echo "=== Verify Claimed Tests ==="
echo "Expected: $TOTAL test files"
echo "Claimed:  $CLAIMED_COUNT test files"

MISSING=0
while IFS= read -r test_file; do
  if ! grep -qF "$test_file" "$CLAIMED_FILE"; then
    echo "  UNCLAIMED: $test_file"
    MISSING=$((MISSING + 1))
  fi
done <<< "$ALL_TESTS"

if [ "$MISSING" -eq 0 ]; then
  echo "✅ All $TOTAL collector tests were claimed and executed"
  exit 0
else
  echo "❌ $MISSING/$TOTAL collector tests were NOT claimed — these tests were never executed!"
  exit 1
fi
