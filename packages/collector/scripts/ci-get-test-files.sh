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
perGroup=$(( (total + MAX_SPLIT - 1) / MAX_SPLIT ))
start=$(( (SPLIT - 1) * perGroup ))

for ((i = start; i < start + perGroup && i < total; i++)); do
  echo "${sorted[$i]}"
done
