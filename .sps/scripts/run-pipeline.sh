#!/usr/bin/env bash
# (c) Copyright IBM Corp. 2026
#
# Fires a manual pipeline trigger by name.
# Looks up a "manual-<name>" trigger in the pipeline and POSTs a pipeline_run
# with the given branch and node-version as trigger_properties overrides.
#
# Usage:
#   .sps/scripts/run-pipeline.sh --branch <branch> --node-version <version> \
#       [--trigger <name>] [--dry-run] [--list]
#
# Options:
#   --branch        Git branch to run against (e.g. my-feature-branch)
#   --node-version  Node.js version to use (e.g. 20, 22, 24)
#   --trigger       Trigger name suffix (e.g. "collector-currencies-async").
#                   The script looks for a trigger called "manual-<name>".
#                   Without it, ALL manual triggers are run.
#   --list          List all available manual triggers and exit
#   --dry-run       Print the API payload without making any calls
#
# Prerequisites:
#   - ibmcloud CLI installed and logged in (ibmcloud login)
#   - jq installed

set -euo pipefail

PIPELINE_ID="579d9c4d-163d-4171-be94-9535ff3f68c4"
REGION="us-south"

# ── parse args ───────────────────────────────────────────────────────────────

TRIGGER_SUFFIX=""
BRANCH=""
NODE_VERSION=""
DRY_RUN=false
LIST=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --trigger)      TRIGGER_SUFFIX="$2"; shift 2 ;;
    --branch)       BRANCH="$2";         shift 2 ;;
    --node-version) NODE_VERSION="$2";   shift 2 ;;
    --dry-run)      DRY_RUN=true;        shift   ;;
    --list)         LIST=true;           shift   ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 --branch <branch> --node-version <version> [--trigger <name>] [--dry-run]"
      exit 1
      ;;
  esac
done

# ── auth ─────────────────────────────────────────────────────────────────────

echo "Fetching IBM Cloud IAM token..."
IAM_TOKEN=$(ibmcloud iam oauth-tokens --output json | jq -r '.iam_token')
if [[ -z "$IAM_TOKEN" || "$IAM_TOKEN" == "null" ]]; then
  echo "ERROR: Could not retrieve IAM token. Run 'ibmcloud login' first."
  exit 1
fi

API_BASE="https://api.${REGION}.devops.cloud.ibm.com/pipeline/v2"

# ── fetch all triggers once ───────────────────────────────────────────────────

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

# ── list mode ────────────────────────────────────────────────────────────────

if [[ "$LIST" == "true" ]]; then
  echo ""
  echo "Available manual triggers:"
  echo "$TRIGGERS_RESP" | jq -r '.triggers[]? | select(.type=="manual") | "  \(.name)"' | sort
  exit 0
fi

# ── validate required args ───────────────────────────────────────────────────

if [[ -z "$BRANCH" || -z "$NODE_VERSION" ]]; then
  echo "ERROR: --branch and --node-version are required."
  echo ""
  echo "Usage: $0 --branch <branch> --node-version <version> [--trigger <name>] [--dry-run]"
  echo "       $0 --list"
  exit 1
fi

# ── resolve trigger_id for a manual trigger by name ──────────────────────────

config_for_trigger() {
  local name="$1"
  echo "$TRIGGERS_RESP" | jq -r \
    --arg n "$name" \
    '.triggers[]? | select(.name==$n) | .properties[]? | select(.name=="pipeline-config") | .value // empty'
}

# ── build list of manual trigger names to run ────────────────────────────────

if [[ -n "$TRIGGER_SUFFIX" ]]; then
  # Accept either "manual-foo" or just "foo"
  if [[ "$TRIGGER_SUFFIX" == manual-* ]]; then
    MANUAL_TRIGGERS="$TRIGGER_SUFFIX"
  else
    MANUAL_TRIGGERS="manual-${TRIGGER_SUFFIX}"
  fi
else
  MANUAL_TRIGGERS=$(echo "$TRIGGERS_RESP" | \
    jq -r '.triggers[]? | select(.type=="manual") | .name' | sort)
fi

TOTAL=$(echo "$MANUAL_TRIGGERS" | grep -c . || true)
echo ""
echo "Branch:       ${BRANCH}"
echo "node-version: ${NODE_VERSION}"
echo "Configs:      ${TOTAL}"
echo ""

# ── helper: fire one run ─────────────────────────────────────────────────────

fire_run() {
  local trigger_name="$1"

  # Verify the trigger exists
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

  # Build trigger_properties — always override branch and node-version.
  # pipeline-config is included only when the trigger has it as a property
  # (so the run uses the right config file).
  local props_jq
  props_jq=$(jq -n \
    --arg branch   "$BRANCH" \
    --arg node_ver "$NODE_VERSION" \
    --arg config   "$config" \
    '{
      "branch":          $branch,
      "node-version":    $node_ver,
      "pipeline-config": $config
    }')

  local PAYLOAD
  PAYLOAD=$(jq -n \
    --arg trigger_name "$trigger_name" \
    --argjson props    "$props_jq" \
    '{
      "trigger_name":       $trigger_name,
      "trigger_properties": $props
    }')

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "  DRY RUN  ${trigger_name}"
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
    echo "  ERROR  ${trigger_name} (HTTP ${HTTP_CODE}): $(echo "$BODY" | jq -r '.errors[0].message // .message // .' 2>/dev/null || echo "$BODY")"
    return
  fi

  RUN_ID=$(echo "$BODY" | jq -r '.id // "?"')
  echo "  OK  ${trigger_name}  →  run ${RUN_ID}"
}

# ── fire runs ─────────────────────────────────────────────────────────────────

STARTED=0
while IFS= read -r t; do
  [[ -z "$t" ]] && continue
  fire_run "$t"
  STARTED=$((STARTED + 1))
done <<< "$MANUAL_TRIGGERS"

echo ""
if [[ "$DRY_RUN" == "true" ]]; then
  echo "Done (dry run). Would have started: ${STARTED}"
else
  echo "Done. Started: ${STARTED}"
  echo "https://cloud.ibm.com/devops/pipelines/tekton/${PIPELINE_ID}/runs?env_id=ibm:yp:${REGION}"
fi
