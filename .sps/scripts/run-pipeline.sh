#!/usr/bin/env bash
# (c) Copyright IBM Corp. 2026
#
# Manually triggers a pipeline run on a specific branch with a specific Node.js version.
#
# Usage:
#   .sps/scripts/run-pipeline.sh --branch <branch> --node-version <version> [--trigger <name>]
#
# Options:
#   --branch       Git branch to run against (e.g. my-feature-branch)
#   --node-version Node.js version to use (e.g. 20, 22, 24)
#   --trigger      (optional) Run only this one trigger. Without it, ALL triggers are run.
#   --list         List all available triggers and exit
#   --dry-run      Print the API payload without making any calls
#
# Prerequisites:
#   - ibmcloud CLI installed and logged in (ibmcloud login)
#   - jq installed

set -euo pipefail

PIPELINE_ID="579d9c4d-163d-4171-be94-9535ff3f68c4"
REGION="us-south"

# ── parse args ───────────────────────────────────────────────────────────────

TRIGGER_NAME=""
BRANCH=""
NODE_VERSION=""
DRY_RUN=false
LIST=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --trigger)      TRIGGER_NAME="$2"; shift 2 ;;
    --branch)       BRANCH="$2";       shift 2 ;;
    --node-version) NODE_VERSION="$2"; shift 2 ;;
    --dry-run)      DRY_RUN=true;      shift   ;;
    --list)         LIST=true;         shift   ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 --trigger <name> --branch <branch> --node-version <version> [--dry-run]"
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

# ── list mode ────────────────────────────────────────────────────────────────

if [[ "$LIST" == "true" ]]; then
  echo "Fetching triggers for pipeline ${PIPELINE_ID}..."
  RESP=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: ${IAM_TOKEN}" \
    -H "Accept: application/json" \
    "${API_BASE}/tekton_pipelines/${PIPELINE_ID}/triggers")
  HTTP_CODE=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | sed '$d')
  if [[ "$HTTP_CODE" != "200" ]]; then
    echo "ERROR: Could not fetch triggers (HTTP ${HTTP_CODE}):"
    echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
    exit 1
  fi
  echo ""
  echo "Available triggers:"
  echo "$BODY" | jq -r '.triggers[]? | "  \(.name)"' | sort
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

# ── resolve trigger list ──────────────────────────────────────────────────────

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

if [[ -n "$TRIGGER_NAME" ]]; then
  TRIGGER_NAMES="$TRIGGER_NAME"
else
  TRIGGER_NAMES=$(echo "$TRIGGERS_RESP" | jq -r '.triggers[]? | .name' | sort)
fi

TOTAL=$(echo "$TRIGGER_NAMES" | wc -l | tr -d ' ')
echo ""
echo "Branch:       ${BRANCH}"
echo "node-version: ${NODE_VERSION}"
echo "Triggers:     ${TOTAL}"
echo ""

# ── helper: fire one run ──────────────────────────────────────────────────────

fire_run() {
  local trigger="$1"

  local PAYLOAD
  PAYLOAD=$(jq -n \
    --arg trigger  "$trigger" \
    --arg branch   "$BRANCH" \
    --arg node_ver "$NODE_VERSION" \
    '{
      trigger_name: $trigger,
      trigger_properties: [
        { name: "node-version", value: $node_ver, type: "text" }
      ],
      branch: $branch
    }')

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "  DRY RUN  ${trigger}"
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
    echo "  ERROR  ${trigger} (HTTP ${HTTP_CODE}): $(echo "$BODY" | jq -r '.message // .' 2>/dev/null || echo "$BODY")"
    return
  fi

  RUN_ID=$(echo "$BODY" | jq -r '.id // "?"')
  echo "  OK  ${trigger}  →  ${RUN_ID}"
}

# ── fire all triggers ─────────────────────────────────────────────────────────

STARTED=0
while IFS= read -r t; do
  [[ -z "$t" ]] && continue
  fire_run "$t"
  STARTED=$((STARTED + 1))
done <<< "$TRIGGER_NAMES"

echo ""
if [[ "$DRY_RUN" == "true" ]]; then
  echo "Done (dry run). Would have started: ${STARTED}"
else
  echo "Done. Started: ${STARTED}"
  echo "https://cloud.ibm.com/devops/pipelines/tekton/${PIPELINE_ID}/runs?env_id=ibm:yp:${REGION}"
fi
