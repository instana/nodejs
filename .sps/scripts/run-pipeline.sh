#!/usr/bin/env bash
# (c) Copyright IBM Corp. 2026
#
# Fires manual pipeline triggers by name.
#
# Usage:
#   .sps/scripts/run-pipeline.sh [--branch <branch>] [--node-version <version>] \
#       [--trigger <name>] [--esm true] [--dry-run] [--list]
#   .sps/scripts/run-pipeline.sh [--branch <branch>] --release [--delay <minutes>] [--dry-run]
#
# Options:
#   --branch        Git branch to run against (default: main)
#   --node-version  Node.js version to use (e.g. 18, 20, 22, 24, 26).
#                   Can also be comma-separated (e.g. 18,20,22).
#                   Defaults to the version in .nvmrc if omitted.
#   --trigger       Trigger name suffix (e.g. "collector-currencies-async").
#                   The script looks for a trigger called "manual-<name>".
#                   Without it, ALL manual triggers are run.
#   --esm           Set to "true" to run tests with RUN_ESM=true
#   --release       Fire all release steps (see RELEASE_STEPS below) sequentially
#                   with a delay between each. Prompts interactively for delay and
#                   which steps to skip.
#   --delay         Minutes to wait between release steps (default: 2).
#                   Only used with --release.
#   --list          List all available manual triggers and exit
#   --dry-run       Print the API payload without making any calls
#
# Prerequisites:
#   - ibmcloud CLI installed and logged in (ibmcloud login)
#   - jq installed

set -euo pipefail

PIPELINE_ID="579d9c4d-163d-4171-be94-9535ff3f68c4"
REGION="us-south"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NVMRC_VERSION="$(cat "${SCRIPT_DIR}/../../.nvmrc" | tr -d '[:space:]')"

# Release step definitions — each entry is "node_version" or "node_version:esm".
# Edit freely to add, remove, or reorder steps.
RELEASE_STEPS=(
  "18"
  "20"
  "22"
  "25"
  "26"
  "24:esm"
)

TRIGGER_SUFFIX=""
BRANCH=""
NODE_VERSION=""
ESM=""
RELEASE=false
DELAY=""
DRY_RUN=false
LIST=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --trigger)       TRIGGER_SUFFIX="$2"; shift 2 ;;
    --branch)        BRANCH="$2";         shift 2 ;;
    --node-version)  NODE_VERSION="$2";   shift 2 ;;
    --esm)           ESM="$2";            shift 2 ;;
    --release)       RELEASE=true;        shift   ;;
    --delay)         DELAY="$2";          shift 2 ;;
    --dry-run)       DRY_RUN=true;        shift   ;;
    --list)          LIST=true;           shift   ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--branch <branch>] [--node-version <version>] [--trigger <name>] [--esm true] [--dry-run]"
      echo "       $0 [--branch <branch>] --release [--delay <minutes>] [--dry-run]"
      exit 1
      ;;
  esac
done

echo "Fetching IBM Cloud IAM token..."
IAM_TOKEN=$(ibmcloud iam oauth-tokens --output json | jq -r '.iam_token')
if [[ -z "$IAM_TOKEN" || "$IAM_TOKEN" == "null" ]]; then
  echo "ERROR: Could not retrieve IAM token. Run 'ibmcloud login' first."
  exit 1
fi

API_BASE="https://api.${REGION}.devops.cloud.ibm.com/pipeline/v2"

echo "Fetching triggers for pipeline ${PIPELINE_ID}..."
TRIGGERS_RESP=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: ${IAM_TOKEN}" \
  -H "Accept: application/json" \
  "${API_BASE}/tekton_pipelines/${PIPELINE_ID}/triggers")
HTTP_CODE=$(echo "$TRIGGERS_RESP" | tail -1)
TRIGGERS_RESP=$(echo "$TRIGGERS_RESP" | sed '$d')
if [[ "$HTTP_CODE" != "200" ]]; then
  echo "ERROR: Could not fetch triggers (HTTP ${HTTP_CODE}):"
  echo "$TRIGGERS_RESP" | jq . 2>/dev/null || echo "$TRIGGERS_RESP"
  exit 1
fi

if [[ "$LIST" == "true" ]]; then
  echo ""
  echo "Available manual triggers:"
  echo "$TRIGGERS_RESP" | jq -r '.triggers[]? | select(.type=="manual") | "  \(.name)"' | sort
  exit 0
fi

if [[ -z "$BRANCH" ]]; then
  BRANCH="main"
  echo "No --branch specified; defaulting to: main"
fi

config_for_trigger() {
  local name="$1"
  echo "$TRIGGERS_RESP" | jq -r \
    --arg n "$name" \
    '.triggers[]? | select(.name==$n) | .properties[]? | select(.name=="pipeline-config") | .value // empty'
}

fire_run() {
  local trigger_name="$1"
  local node_ver="$2"
  local run_esm="${3:-}"

  local exists
  exists=$(echo "$TRIGGERS_RESP" | jq -r \
    --arg n "$trigger_name" \
    '.triggers[]? | select(.type=="manual" and .name==$n) | .name // empty')
  if [[ -z "$exists" ]]; then
    echo "  ERROR  ${trigger_name}: trigger not found (type=manual). Run --list to see available triggers."
    return
  fi

  local config
  config=$(config_for_trigger "$trigger_name")

  local props_jq
  if [[ -n "$run_esm" ]]; then
    props_jq=$(jq -n \
      --arg branch   "$BRANCH" \
      --arg node_ver "$node_ver" \
      --arg config   "$config" \
      --arg run_esm  "$run_esm" \
      '{
        "branch":          $branch,
        "node-version":    $node_ver,
        "pipeline-config": $config,
        "RUN_ESM":         $run_esm
      }')
  else
    props_jq=$(jq -n \
      --arg branch   "$BRANCH" \
      --arg node_ver "$node_ver" \
      --arg config   "$config" \
      '{
        "branch":          $branch,
        "node-version":    $node_ver,
        "pipeline-config": $config
      }')
  fi

  local PAYLOAD
  PAYLOAD=$(jq -n \
    --arg trigger_name "$trigger_name" \
    --argjson props    "$props_jq" \
    '{
      "trigger_name":       $trigger_name,
      "trigger_properties": $props
    }')

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "  DRY RUN  ${trigger_name} (node ${node_ver})"
    echo "$PAYLOAD" | jq .
    return
  fi

  RESP=$(curl -s -w "\n%{http_code}" -X POST \
    -H "Authorization: ${IAM_TOKEN}" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -d "$PAYLOAD" \
    "${API_BASE}/tekton_pipelines/${PIPELINE_ID}/pipeline_runs")
  HTTP_CODE=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | sed '$d')

  if [[ "$HTTP_CODE" != "201" && "$HTTP_CODE" != "200" ]]; then
    echo "  ERROR  ${trigger_name} [node ${node_ver}] (HTTP ${HTTP_CODE}): $(echo "$BODY" | jq -r '.errors[0].message // .message // .' 2>/dev/null || echo "$BODY")"
    return
  fi

  echo "  OK  ${trigger_name} [node ${node_ver}]  →  run $(echo "$BODY" | jq -r '.id // "?"')"
}

# ── release mode ──────────────────────────────────────────────────────────────

if [[ "$RELEASE" == "true" ]]; then
  if [[ -z "$DELAY" ]]; then
    read -r -p "Delay between steps in minutes [default: 2]: " USER_DELAY
    DELAY="${USER_DELAY:-2}"
  fi
  DELAY_SECS=$(( DELAY * 60 ))

  echo ""
  echo "Release steps:"
  for i in "${!RELEASE_STEPS[@]}"; do
    step="${RELEASE_STEPS[$i]}"
    node_ver="${step%%:*}"
    label=""
    [[ "$step" == *":esm"* ]] && label=" + ESM"
    echo "  $((i+1)). Node ${node_ver}${label}"
  done
  echo ""
  read -r -p "Skip any steps? Enter numbers to skip (e.g. 1 3), or press Enter to run all: " SKIP_INPUT

  SKIP_INDICES=()
  [[ -n "$SKIP_INPUT" ]] && read -ra SKIP_INDICES <<< "$SKIP_INPUT"

  should_skip() {
    local idx="$1"
    for s in "${SKIP_INDICES[@]}"; do [[ "$s" == "$idx" ]] && return 0; done
    return 1
  }

  echo ""
  echo "Branch:   ${BRANCH}"
  echo "Delay:    ${DELAY} minute(s) between steps"
  echo "Dry run:  ${DRY_RUN}"
  echo "Steps:    $((${#RELEASE_STEPS[@]} - ${#SKIP_INDICES[@]})) of ${#RELEASE_STEPS[@]} will run"
  echo ""

  MANUAL_TRIGGERS=$(echo "$TRIGGERS_RESP" | \
    jq -r '.triggers[]? | select(.type=="manual" and (.name | startswith("manual-dep-") | not)) | .name' | sort)

  FIRST=true
  STARTED=0
  for i in "${!RELEASE_STEPS[@]}"; do
    step_num=$((i+1))
    step="${RELEASE_STEPS[$i]}"
    node_ver="${step%%:*}"
    step_esm=""
    step_label=""
    [[ "$step" == *":esm"* ]] && { step_esm="true"; step_label=" + ESM"; }

    if should_skip "$step_num"; then
      echo "── Step ${step_num}: Node ${node_ver}${step_label}  [SKIPPED]"
      continue
    fi

    if [[ "$FIRST" == "false" && "$DRY_RUN" == "false" ]]; then
      echo ""
      echo "Waiting ${DELAY} minute(s) before next step..."
      sleep "$DELAY_SECS"
    fi

    echo ""
    echo "── Step ${step_num}: Node ${node_ver}${step_label} ──────────────────────────────────"

    while IFS= read -r t; do
      [[ -z "$t" ]] && continue
      fire_run "$t" "$node_ver" "$step_esm"
      STARTED=$((STARTED + 1))
    done <<< "$MANUAL_TRIGGERS"

    FIRST=false
  done

  echo ""
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "Done (dry run). Would have started: ${STARTED}"
  else
    echo "Done. Started: ${STARTED}"
    echo "https://cloud.ibm.com/devops/pipelines/tekton/${PIPELINE_ID}/runs?env_id=ibm:yp:${REGION}"
  fi
  exit 0
fi

# ── normal mode ───────────────────────────────────────────────────────────────

if [[ -n "$NODE_VERSION" ]]; then
  IFS=',' read -ra NODE_VERSIONS <<< "$NODE_VERSION"
else
  NODE_VERSIONS=("$NVMRC_VERSION")
  echo "No --node-version specified; using version from .nvmrc: ${NVMRC_VERSION}"
fi

if [[ -n "$TRIGGER_SUFFIX" ]]; then
  if [[ "$TRIGGER_SUFFIX" == manual-* ]]; then
    MANUAL_TRIGGERS="$TRIGGER_SUFFIX"
  else
    MANUAL_TRIGGERS="manual-${TRIGGER_SUFFIX}"
  fi
else
  MANUAL_TRIGGERS=$(echo "$TRIGGERS_RESP" | \
    jq -r '.triggers[]? | select(.type=="manual" and (.name | startswith("manual-dep-") | not)) | .name' | sort)
fi

TOTAL_TRIGGERS=$(echo "$MANUAL_TRIGGERS" | grep -c . || true)
TOTAL_RUNS=$(( TOTAL_TRIGGERS * ${#NODE_VERSIONS[@]} ))
echo ""
echo "Branch:        ${BRANCH}"
echo "Node versions: ${NODE_VERSIONS[*]}"
[[ -n "$ESM" ]] && echo "RUN_ESM:       ${ESM}"
echo "Triggers:      ${TOTAL_TRIGGERS}"
echo "Total runs:    ${TOTAL_RUNS}"
echo ""

STARTED=0
for n_ver in "${NODE_VERSIONS[@]}"; do
  echo "── Running for Node ${n_ver} ──────────────────────────────────────"
  while IFS= read -r t; do
    [[ -z "$t" ]] && continue
    fire_run "$t" "$n_ver" "$ESM"
    STARTED=$((STARTED + 1))
  done <<< "$MANUAL_TRIGGERS"
done

echo ""
if [[ "$DRY_RUN" == "true" ]]; then
  echo "Done (dry run). Would have started: ${STARTED}"
else
  echo "Done. Started: ${STARTED}"
  echo "https://cloud.ibm.com/devops/pipelines/tekton/${PIPELINE_ID}/runs?env_id=ibm:yp:${REGION}"
fi
