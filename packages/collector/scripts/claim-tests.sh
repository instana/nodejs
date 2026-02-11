#!/bin/bash

ENV_PREFIX="INSTANA_CONNECT_"

# Args: $1 = available sidecars (comma-separated), $2 = test pattern, $3 = total tasks, $4 = artifacts path, $5 = sidecar counts
AVAILABLE_SIDECARS="$1"
TEST_PATTERN="$2"
TOTAL_TASKS="${3:-40}"
ARTIFACTS_PATH="${4:-/artifacts}"
SIDECAR_COUNTS="${5:-$SIDECAR_COUNTS}"

# Always run from the collector package directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
CONFIG_PATH="$SCRIPT_DIR/../../../hosts_config.json"
cd "$SCRIPT_DIR/.." || exit 1

LOCK_FILE="$ARTIFACTS_PATH/.test-claim.lock"
CLAIMED_FILE="$ARTIFACTS_PATH/claimed-tests.txt"
OUTPUT_FILE="$ARTIFACTS_PATH/my-tests-$$.txt"

# Ensure claimed file exists
touch "$CLAIMED_FILE"

# Find all test files matching pattern and randomize order (portable shuffle)
# Inside _v* directories, only accept generated files (*.test.js) — filter out stale copies from previous runs.
ALL_TESTS=$(find "$(pwd)" -path "*$TEST_PATTERN" -name "*.test.js" -not -path "*/node_modules/*" -not -path "*/long_*/*" | awk '!/_v[0-9]/ || /\/_v[^\/]+\/([^\/]+\/)?[^\/]+\.test\.js$/' | awk 'BEGIN{srand();}{print rand()"\t"$0}' | sort -k1 -n | cut -f2-)
TOTAL_TEST_COUNT=$(echo "$ALL_TESTS" | wc -l | xargs)

# Calculate how many tests this task should claim (Soft Limit)
TESTS_PER_TASK=$(( (TOTAL_TEST_COUNT + TOTAL_TASKS - 1) / TOTAL_TASKS ))

# Load all known env vars from hosts_config.json
if [ -z "$KNOWN_ENVS" ]; then
  if [ -f "$CONFIG_PATH" ]; then
    KNOWN_ENVS=$(node -e "console.log(Object.keys(require('$CONFIG_PATH')).join('\n'))")
  fi
fi



# Pre-process tests to sort by priority (Priority > Generic) AND calculate Quotas
PRIO_TESTS=""
GENERIC_TESTS=""

# We use eval for dynamic variables to simulate associative arrays (Bash 3 compatible)
# Variables: REQ_COUNTS_<service>, SIDECAR_QUOTAS_<service>, MY_REQ_USAGE_<service>

for test_file in $ALL_TESTS; do
  REQUIRED_SIDECARS=""
  
  # Scan the test package directory for sidecar requirements (navigate past _v* and optional mode subdir)
  TEST_DIR=$(dirname "$test_file")
  SCAN_DIR="$TEST_DIR"
  if echo "$TEST_DIR" | grep -q '/_v[^/]*$'; then
    SCAN_DIR="$(dirname "$TEST_DIR")"
  elif echo "$(dirname "$TEST_DIR")" | grep -q '/_v[^/]*$'; then
    SCAN_DIR="$(dirname "$(dirname "$TEST_DIR")")"
  fi
  USED_ENVS=$(find -L "$SCAN_DIR" -maxdepth 1 \( -name "*.js" -o -name "*.mjs" \) -exec grep -h -o "${ENV_PREFIX}[A-Z0-9_]*" {} + 2>/dev/null | sort | uniq)

  
  if [ -n "$USED_ENVS" ]; then
    for env_var in $USED_ENVS; do
      if echo "$KNOWN_ENVS" | grep -q "^$env_var$"; then
        suffix=${env_var#$ENV_PREFIX}
        service_upper=$(echo "$suffix" | cut -d'_' -f1)
        service=$(echo "$service_upper" | tr '[:upper:]' '[:lower:]')
        REQUIRED_SIDECARS="$REQUIRED_SIDECARS $service"
      fi
    done
    REQUIRED_SIDECARS=$(echo "$REQUIRED_SIDECARS" | tr -s ' ' '\n' | sort -u | tr '\n' ' ')
  fi

  # Check availability
  MISSING=false
  HAS_REQUIREMENTS=false
  
  if [ -n "$REQUIRED_SIDECARS" ]; then
    HAS_REQUIREMENTS=true
    
    # Check if we have the sidecars
    for req in $REQUIRED_SIDECARS; do
      if [[ ",$AVAILABLE_SIDECARS," != *",$req,"* ]]; then
        MISSING=true
        break
      fi
    done
    
    if [ "$MISSING" = false ]; then
        PRIO_TESTS="$PRIO_TESTS $test_file"
        # Count requirements for quota calculation
        for req in $REQUIRED_SIDECARS; do
            # REQ_COUNTS_<req>++
            curr=$(eval echo "\${REQ_COUNTS_${req}:-0}")
            eval "REQ_COUNTS_${req}=$((curr + 1))"
        done
    else
       continue 
    fi
    
  else
    GENERIC_TESTS="$GENERIC_TESTS $test_file"
  fi
done

# Calculate Quotas
# SIDECAR_COUNTS format: "postgres=4,kafka=10"
if [ -n "$SIDECAR_COUNTS" ]; then
  IFS=',' read -ra ADDR <<< "$SIDECAR_COUNTS"
  for entry in "${ADDR[@]}"; do
    sidecar="${entry%%=*}"
    count="${entry##*=}"
    # Sanitize: bash variable names cannot contain hyphens
    sidecar_var=$(echo "$sidecar" | tr '-' '_')
    if [ -n "$sidecar_var" ] && [ -n "$count" ] && [ "$count" -gt 0 ]; then
       total_req=$(eval echo "\${REQ_COUNTS_${sidecar_var}:-0}")
       
       if [ "$total_req" -gt 0 ]; then
         quota=$(( (total_req + count - 1) / count ))
         eval "SIDECAR_QUOTAS_${sidecar_var}=$quota"
       fi
    fi
  done
fi

# Combine lists: Priority first, then Generic
FINAL_LIST="$PRIO_TESTS $GENERIC_TESTS"
FINAL_LIST=$(echo "$FINAL_LIST" | xargs)
PRIO_COUNT=$(echo "$PRIO_TESTS" | wc -w | xargs)

# Acquire lock and claim tests
LOCK_DIR="$ARTIFACTS_PATH/.test-claim.lock.dir"

MAX_RETRIES=600
i=0
while ! mkdir "$LOCK_DIR" 2>/dev/null; do
  if [ $i -ge $MAX_RETRIES ]; then
    echo "Failed to acquire lock after $MAX_RETRIES attempts"
    exit 1
  fi
  sleep 0.1
  i=$((i + 1))
done

trap 'rmdir "$LOCK_DIR" 2>/dev/null' EXIT

# Read already claimed tests
CLAIMED=$(cat "$CLAIMED_FILE" 2>/dev/null || echo "")
CLAIMED_COUNT=0
PROCESSED=0

for test_file in $FINAL_LIST; do
  PROCESSED=$((PROCESSED + 1))

  # Only enforce the per-task limit for generic tests.
  # Priority tests (requiring specific sidecars) must always be claimable
  # because no other runner can execute them.
  if [ $PROCESSED -gt $PRIO_COUNT ] && [ $CLAIMED_COUNT -ge $TESTS_PER_TASK ]; then
    break
  fi
  
  if echo "$CLAIMED" | grep -qF "$test_file"; then
    continue
  fi
  
  # Check Sidecar Quota
  TEST_DIR_CHECK=$(dirname "$test_file")
  SCAN_DIR_CHECK="$TEST_DIR_CHECK"
  if echo "$TEST_DIR_CHECK" | grep -q '/_v[^/]*$'; then
    SCAN_DIR_CHECK="$(dirname "$TEST_DIR_CHECK")"
  elif echo "$(dirname "$TEST_DIR_CHECK")" | grep -q '/_v[^/]*$'; then
    SCAN_DIR_CHECK="$(dirname "$(dirname "$TEST_DIR_CHECK")")"
  fi
  USED_ENVS_CHECK=$(find -L "$SCAN_DIR_CHECK" -maxdepth 1 \( -name "*.js" -o -name "*.mjs" \) -exec grep -h -o "${ENV_PREFIX}[A-Z0-9_]*" {} + 2>/dev/null | sort | uniq)
  
  QUOTA_EXCEEDED=false
  QUOTA_CHECK_REQ=""
  
  if [ -n "$USED_ENVS_CHECK" ]; then
    # Resolve unique services first
    SERVICES_CHECK=""
    for env_var in $USED_ENVS_CHECK; do
        if echo "$KNOWN_ENVS" | grep -q "^$env_var$"; then
           suffix=${env_var#$ENV_PREFIX}
           service_upper=$(echo "$suffix" | cut -d'_' -f1)
           service=$(echo "$service_upper" | tr '[:upper:]' '[:lower:]')
           SERVICES_CHECK="$SERVICES_CHECK $service"
        fi
    done
    SERVICES_CHECK=$(echo "$SERVICES_CHECK" | tr -s ' ' '\n' | sort -u | tr '\n' ' ')

    for service in $SERVICES_CHECK; do
        quote=$(eval echo "\${SIDECAR_QUOTAS_${service}:-0}")
        if [ "$quote" -gt 0 ]; then
          usage=$(eval echo "\${MY_REQ_USAGE_${service}:-0}")
          if [ "$usage" -ge "$quote" ]; then
             QUOTA_EXCEEDED=true
             break
          fi
          QUOTA_CHECK_REQ="$QUOTA_CHECK_REQ $service"
        fi
    done
  fi
  
  if [ "$QUOTA_EXCEEDED" = true ]; then
     continue 
  fi
  
  # Update Usage if claiming
  for req in $QUOTA_CHECK_REQ; do
     curr=$(eval echo "\${MY_REQ_USAGE_${req}:-0}")
     eval "MY_REQ_USAGE_${req}=$((curr + 1))"
  done
  
  echo "$test_file" >> "$CLAIMED_FILE"
  echo "$test_file" >> "$OUTPUT_FILE"
  CLAIMED_COUNT=$((CLAIMED_COUNT + 1))
done

# Output claimed tests for this task
if [ -f "$OUTPUT_FILE" ]; then
  cat "$OUTPUT_FILE"
  rm "$OUTPUT_FILE"
fi

rmdir "$LOCK_DIR" 2>/dev/null
trap - EXIT
