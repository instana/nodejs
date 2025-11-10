#!/bin/bash

#######################################
# (c) Copyright IBM Corp. 2025
#######################################

set -euo pipefail

PATTERN=$1
shift

SPLIT="${CI_TEST_SPLIT_CURRENT:-1}"
MAX_SPLIT="${CI_TEST_SPLIT:-1}"

shopt -s globstar
files=$(ls $PATTERN)

if [ -z "$files" ]; then
  echo "No Files: $PATTERN" >&2
  exit 1
fi

IFS=$'\n' sorted=($(printf "%s\n" $files | sort))
unset IFS

total=${#sorted[@]}

# Calculate files per group using floor division
# This ensures more even distribution across all splits
perGroup=$(( total / MAX_SPLIT ))

remainder=$(( total % MAX_SPLIT ))

if [ $SPLIT -le $remainder ]; then
  start=$(( (SPLIT - 1) * (perGroup + 1) ))
  count=$(( perGroup + 1 ))
else
  start=$(( remainder * (perGroup + 1) + (SPLIT - remainder - 1) * perGroup ))
  count=$perGroup
fi

for ((i = start; i < start + count && i < total; i++)); do
  echo "${sorted[$i]}"
done
