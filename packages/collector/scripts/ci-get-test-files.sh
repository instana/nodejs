#!/bin/bash

#######################################
# (c) Copyright IBM Corp. 2025
#######################################

set -euo pipefail

PATTERN=$1
shift

SPLIT="${CI_TEST_SPLIT_CURRENT:-1}"
MAX_SPLIT="${CI_TEST_SPLIT:-1}"

# Extract the directory path from the pattern
# Pattern format: test/tracing/databases/**/*test.js
# We need to extract: test/tracing/databases
DIR_PATH=$(echo "$PATTERN" | sed 's|/\*\*.*||')

# Use find to get only files within the specified directory
files=$(find "$DIR_PATH" -name "*test.js" -type f 2>/dev/null || true)

if [ -z "$files" ]; then
  echo "No Files: $PATTERN" >&2
  exit 1
fi

IFS=$'\n' sorted=($(printf "%s\n" $files | sort))
unset IFS

total=${#sorted[@]}
perGroup=$(( (total + MAX_SPLIT - 1) / MAX_SPLIT ))
start=$(( (SPLIT - 1) * perGroup ))

for ((i = start; i < start + perGroup && i < total; i++)); do
  echo "${sorted[$i]}"
done
