#!/usr/bin/env bash
# (c) Copyright IBM Corp. 2026
#
# Manually triggers a pipeline run on a specific branch with a specific Node.js version.
# Uses the GitHub API to dispatch a repository_dispatch event which fires the SCM trigger.
#
# Usage:
#   .sps/scripts/run-pipeline.sh --branch <branch> --node-version <version> [--trigger <trigger-name>]
#
# Options:
#   --branch       Git branch to run against (e.g. my-feature-branch)
#   --node-version Node.js version to use (e.g. 20, 22, 24)
#   --trigger      (optional) Trigger name (e.g. collector-currencies-async).
#                  Without it, ALL scm triggers are run.
#   --list         List all available scm triggers and exit
#   --dry-run      Print the API payload without making any calls
#
# Prerequisites:
#   - ibmcloud CLI installed and logged in (ibmcloud login)
#   - jq installed

set -euo pipefail

PIPELINE_ID="579d9c4d-163d-4171-be94-9535ff3f68c4"
REGION="us-south"

# ── parse args ───────────────────────────────────────────────────────────────

SCM_TRIGGER=""
BRANCH=""
NODE_VERSION=""
DRY_RUN=false
LIST=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --trigger)      SCM_TRIGGER="$2"; shift 2 ;;
    --branch)       BRANCH="$2";      shift 2 ;;
    --node-version) NODE_VERSION="$2";shift 2 ;;
    --dry-run)      DRY_RUN=true;     shift   ;;
    --list)         LIST=true;        shift   ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 --branch <branch> --node-version <version> [--trigger <scm-trigger-name>] [--dry-run]"
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
  echo "Available scm triggers:"
  echo "$TRIGGERS_RESP" | jq -r '.triggers[]? | select(.type=="scm") | "  \(.name)"' | sort
  exit 0
fi

# ── validate required args ───────────────────────────────────────────────────

if [[ -z "$BRANCH" || -z "$NODE_VERSION" ]]; then
  echo "ERROR: --branch and --node-version are required."
  echo ""
  echo "Usage: $0 --branch <branch> --node-version <version> [--trigger <scm-trigger-name>] [--dry-run]"
  echo "       $0 --list"
  exit 1
fi

# ── resolve pipeline-config per scm trigger name ─────────────────────────────

config_for_trigger() {
  local scm_name="$1"
  echo "$TRIGGERS_RESP" | jq -r \
    --arg n "$scm_name" \
    '.triggers[]? | select(.name == $n) | .properties[]? | select(.name == "pipeline-config") | .value'
}

# ── build list of scm trigger names to run ───────────────────────────────────

if [[ -n "$SCM_TRIGGER" ]]; then
  SCM_TRIGGERS="$SCM_TRIGGER"
else
  SCM_TRIGGERS=$(echo "$TRIGGERS_RESP" | jq -r '.triggers[]? | select(.type=="scm") | .name' | sort)
fi

TOTAL=$(echo "$SCM_TRIGGERS" | grep -c . || true)
echo ""
echo "Branch:       ${BRANCH}"
echo "node-version: ${NODE_VERSION}"
echo "Configs:      ${TOTAL}"
echo ""

# ── helper: fire one run ─────────────────────────────────────────────────────

fire_run() {
  local scm_name="$1"
  local config
  config=$(config_for_trigger "$scm_name")

  if [[ -z "$config" ]]; then
    echo "  SKIP  ${scm_name} (no pipeline-config property found)"
    return
  fi

  # Resolve HEAD SHA locally via git
  local sha
  sha=$(git rev-parse "origin/${BRANCH}" 2>/dev/null || git rev-parse "${BRANCH}" 2>/dev/null || echo "")
  if [[ -z "$sha" ]]; then
    echo "  WARN  could not resolve SHA for branch ${BRANCH} — run 'git fetch' first"
  fi

  local PAYLOAD
  PAYLOAD=$(jq -n \
    --arg config   "$config" \
    --arg node_ver "$NODE_VERSION" \
    '{
      "trigger_name": "manual-run",
      "trigger_properties": {
        "pipeline-config": $config,
        "node-version":    $node_ver
      }
    }')

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "  DRY RUN  ${scm_name}  →  ${config}"
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
    echo "  ERROR  ${scm_name} (HTTP ${HTTP_CODE}): $(echo "$BODY" | jq -r '.errors[0].message // .message // .' 2>/dev/null || echo "$BODY")"
    return
  fi

  RUN_ID=$(echo "$BODY" | jq -r '.id // "?"')
  echo "  OK  ${scm_name}  →  ${RUN_ID}"
}

# ── fire runs ─────────────────────────────────────────────────────────────────

STARTED=0
while IFS= read -r t; do
  [[ -z "$t" ]] && continue
  fire_run "$t"
  STARTED=$((STARTED + 1))
done <<< "$SCM_TRIGGERS"

echo ""
if [[ "$DRY_RUN" == "true" ]]; then
  echo "Done (dry run). Would have started: ${STARTED}"
else
  echo "Done. Started: ${STARTED}"
  echo "https://cloud.ibm.com/devops/pipelines/tekton/${PIPELINE_ID}/runs?env_id=ibm:yp:${REGION}"
fi
