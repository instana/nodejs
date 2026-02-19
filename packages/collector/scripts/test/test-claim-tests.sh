#!/bin/bash

BASE_DIR="$(cd "$(dirname "$0")/../../../.." && pwd)"
SCRIPT_DIR="$(dirname "$0")"
ARTIFACTS_DIR="$BASE_DIR/.artifacts_real"
CONFIG_PATH="$BASE_DIR/hosts_config.json"

rm -rf "$ARTIFACTS_DIR"
mkdir -p "$ARTIFACTS_DIR"

cd "$BASE_DIR/packages/collector" || exit 1

KNOWN_ENVS=$(node -e "console.log(Object.keys(require('$CONFIG_PATH')).join('\n'))")

HAS_FAILURES=false

# Resolves env vars for a test directory (follows symlinks via find -L)
resolve_services_for_dir() {
  local test_dir="$1"
  local used_envs
  used_envs=$(find -L "$test_dir" -maxdepth 1 \( -name "*.js" -o -name "*.mjs" \) -exec grep -h -o "INSTANA_CONNECT_[A-Z0-9_]*" {} + 2>/dev/null | sort | uniq)

  local services=""
  for env_var in $used_envs; do
    if echo "$KNOWN_ENVS" | grep -q "^$env_var$"; then
      local suffix=${env_var#INSTANA_CONNECT_}
      local service_upper
      service_upper=$(echo "$suffix" | cut -d'_' -f1)
      local service
      service=$(echo "$service_upper" | tr '[:upper:]' '[:lower:]')
      services="$services $service"
    fi
  done
  echo "$services" | tr -s ' ' '\n' | sort -u | tr '\n' ',' | sed 's/^,//;s/,$//'
}

PATTERN="test/integration/*"

echo "==================================================="
echo "Phase 1: Analyze all *.test.js files for env dependencies"
echo "==================================================="

ALL_INTEGRATION=$(find . -path "*$PATTERN" -name "*.test.js" -not -path "*/node_modules/*" -not -path "*/long_*/*" | sort)
TOTAL_INTEGRATION=$(echo "$ALL_INTEGRATION" | wc -l | tr -d ' ')
echo "Found $TOTAL_INTEGRATION integration test files"
echo ""

ALL_REQUIRED_SERVICES=""
TESTS_WITH_DEPS=0
TESTS_GENERIC=0
# Mapping: "test_path|service1,service2" per line
DEP_MAP_FILE="$ARTIFACTS_DIR/dep-map.txt"
>"$DEP_MAP_FILE"

while IFS= read -r test_file; do
  TEST_DIR=$(dirname "$test_file")
  SERVICES=$(resolve_services_for_dir "$TEST_DIR")

  if [ -n "$SERVICES" ]; then
    TESTS_WITH_DEPS=$((TESTS_WITH_DEPS + 1))
    ALL_REQUIRED_SERVICES="$ALL_REQUIRED_SERVICES $(echo "$SERVICES" | tr ',' ' ')"
    echo "$test_file|$SERVICES" >>"$DEP_MAP_FILE"
    echo "  [deps: $SERVICES] $test_file"
  else
    echo "  [generic] $test_file"
    TESTS_GENERIC=$((TESTS_GENERIC + 1))
  fi
done <<<"$ALL_INTEGRATION"

UNIQUE_SERVICES=$(echo "$ALL_REQUIRED_SERVICES" | tr -s ' ' '\n' | sort -u | grep -v '^$' | tr '\n' ',' | sed 's/,$//')

echo ""
echo "Tests with dependencies: $TESTS_WITH_DEPS"
echo "Generic tests (no deps): $TESTS_GENERIC"
echo "Required services: $UNIQUE_SERVICES"

# ===================================================================
# Phase 2: Full simulation — all sidecars available, 4 tasks
# ===================================================================
echo ""
echo "==================================================="
echo "Phase 2: Full Simulation — all sidecars available, 4 tasks"
echo "Expected: ALL $TOTAL_INTEGRATION integration tests claimed"
echo "==================================================="

NUM_TASKS=4

SIDECAR_COUNTS=""
for service in $(echo "$ALL_REQUIRED_SERVICES" | tr -s ' ' '\n' | sort -u | grep -v '^$'); do
  [ -n "$SIDECAR_COUNTS" ] && SIDECAR_COUNTS="$SIDECAR_COUNTS,"
  SIDECAR_COUNTS="${SIDECAR_COUNTS}${service}=${NUM_TASKS}"
done
export SIDECAR_COUNTS
echo "SIDECAR_COUNTS=$SIDECAR_COUNTS"

rm -f "$ARTIFACTS_DIR/claimed-tests.txt"
rmdir "$ARTIFACTS_DIR/.test-claim.lock.dir" 2>/dev/null

for i in $(seq 1 $NUM_TASKS); do
  TASK_OUTPUT=$(bash "scripts/claim-tests.sh" "$UNIQUE_SERVICES" "$PATTERN" "$NUM_TASKS" "$ARTIFACTS_DIR")
  echo "$TASK_OUTPUT" >"$ARTIFACTS_DIR/task-${i}.txt"
done

CLAIMED=$(cat "$ARTIFACTS_DIR/claimed-tests.txt" 2>/dev/null | wc -l | tr -d ' ')
echo "Claimed: $CLAIMED / $TOTAL_INTEGRATION"

if [ "$CLAIMED" -eq "$TOTAL_INTEGRATION" ]; then
  echo "✅ PASS: 100% distribution"
else
  echo "❌ FAIL: Not all tests distributed"
  HAS_FAILURES=true

  echo ""
  echo "Unclaimed tests:"
  while IFS= read -r test_file; do
    if ! grep -qF "$test_file" "$ARTIFACTS_DIR/claimed-tests.txt" 2>/dev/null; then
      echo "  MISSING: $test_file"
    fi
  done <<<"$ALL_INTEGRATION"
fi

# Check per-task and per-sidecar distribution
echo ""
echo "Per-task overview:"

TESTS_PER_TASK=$(((TOTAL_INTEGRATION + NUM_TASKS - 1) / NUM_TASKS))

for i in $(seq 1 $NUM_TASKS); do
  TASK_FILE="$ARTIFACTS_DIR/task-${i}.txt"
  TASK_TOTAL=$(cat "$TASK_FILE" 2>/dev/null | grep -c '.' || echo 0)

  TASK_DEP_COUNT=0
  while IFS= read -r mapping; do
    dep_test="${mapping%%|*}"
    if grep -qF "$dep_test" "$TASK_FILE" 2>/dev/null; then
      TASK_DEP_COUNT=$((TASK_DEP_COUNT + 1))
    fi
  done <"$DEP_MAP_FILE"

  TASK_GENERIC=$((TASK_TOTAL - TASK_DEP_COUNT))
  echo "  Task $i: $TASK_TOTAL total ($TASK_DEP_COUNT deps, $TASK_GENERIC generic)"
done

echo ""
echo "Per-sidecar quota check:"

QUOTA_OK=true

for service in $(echo "$UNIQUE_SERVICES" | tr ',' '\n'); do
  # Total tests for this service
  SERVICE_TOTAL=$(grep "|.*${service}" "$DEP_MAP_FILE" | wc -l | tr -d ' ')
  QUOTA=$(((SERVICE_TOTAL + NUM_TASKS - 1) / NUM_TASKS))

  DETAIL=""
  for i in $(seq 1 $NUM_TASKS); do
    TASK_FILE="$ARTIFACTS_DIR/task-${i}.txt"
    TASK_SERVICE_COUNT=0

    while IFS= read -r mapping; do
      dep_test="${mapping%%|*}"
      dep_services="${mapping##*|}"
      if echo ",$dep_services," | grep -q ",$service,"; then
        if grep -qF "$dep_test" "$TASK_FILE" 2>/dev/null; then
          TASK_SERVICE_COUNT=$((TASK_SERVICE_COUNT + 1))
        fi
      fi
    done <"$DEP_MAP_FILE"

    DETAIL="${DETAIL} T${i}=${TASK_SERVICE_COUNT}"

    if [ "$TASK_SERVICE_COUNT" -gt "$QUOTA" ]; then
      QUOTA_OK=false
      DETAIL="${DETAIL}(!)"
    fi
  done

  printf "  %-15s total=%-2d quota=%-2d |%s\n" "$service" "$SERVICE_TOTAL" "$QUOTA" "$DETAIL"
done

if [ "$QUOTA_OK" = true ]; then
  echo "✅ PASS: No task exceeds its per-sidecar quota"
else
  echo "❌ FAIL: Some tasks exceeded their sidecar quota"
  HAS_FAILURES=true
fi

# ===================================================================
# Phase 3: No sidecars — only generic tests should be claimed
# ===================================================================
echo ""
echo "==================================================="
echo "Phase 3: No sidecars available"
echo "Expected: Only $TESTS_GENERIC generic tests claimed (not the $TESTS_WITH_DEPS with deps)"
echo "==================================================="

rm -f "$ARTIFACTS_DIR/claimed-tests.txt"
rmdir "$ARTIFACTS_DIR/.test-claim.lock.dir" 2>/dev/null
export SIDECAR_COUNTS=""

for i in $(seq 1 $NUM_TASKS); do
  bash "scripts/claim-tests.sh" "" "$PATTERN" "$NUM_TASKS" "$ARTIFACTS_DIR" >/dev/null
done

CLAIMED_NO_SIDECAR=$(cat "$ARTIFACTS_DIR/claimed-tests.txt" 2>/dev/null | wc -l | tr -d ' ')
echo "Claimed: $CLAIMED_NO_SIDECAR / $TESTS_GENERIC expected"

if [ "$CLAIMED_NO_SIDECAR" -eq "$TESTS_GENERIC" ]; then
  echo "✅ PASS: Only generic tests claimed"
else
  DIFF=$((CLAIMED_NO_SIDECAR - TESTS_GENERIC))
  echo "❌ FAIL: Expected $TESTS_GENERIC, got $CLAIMED_NO_SIDECAR (diff: $DIFF)"
  HAS_FAILURES=true
fi

# ===================================================================
echo ""
echo "==================================================="
if [ "$HAS_FAILURES" = true ]; then
  echo "❌ SOME CHECKS FAILED"
  exit 1
else
  echo "✅ ALL CHECKS PASSED"
fi
