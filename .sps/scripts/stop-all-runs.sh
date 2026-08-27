#!/usr/bin/env bash
# (c) Copyright IBM Corp. 2026
#
# Stops (cancels) all active pipeline runs on the nodejs toolchain.
#
# Usage:
#   .sps/scripts/stop-all-runs.sh [--dry-run]
#
# Prerequisites:
#   - ibmcloud CLI installed and logged in (ibmcloud login)
#   - jq installed

set -euo pipefail

PIPELINE_ID="579d9c4d-163d-4171-be94-9535ff3f68c4"
REGION="us-south"

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  echo ">>> DRY RUN — no API calls will be made <<<"
  echo ""
fi

# ── auth ────────────────────────────────────────────────────────────────────

echo "Fetching IBM Cloud IAM token..."
IAM_TOKEN=$(ibmcloud iam oauth-tokens --output json | jq -r '.iam_token')
if [[ -z "$IAM_TOKEN" || "$IAM_TOKEN" == "null" ]]; then
  echo "ERROR: Could not retrieve IAM token. Run 'ibmcloud login' first."
  exit 1
fi

API_BASE="https://api.${REGION}.devops.cloud.ibm.com/pipeline/v2"

# ── fetch active runs ────────────────────────────────────────────────────────

echo "Fetching active pipeline runs for ${PIPELINE_ID}..."
RUNS_RESP=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: ${IAM_TOKEN}" \
  -H "Accept: application/json" \
  "${API_BASE}/tekton_pipelines/${PIPELINE_ID}/pipeline_runs?status=running&limit=50")

HTTP_CODE=$(echo "$RUNS_RESP" | tail -1)
RUNS_RESP=$(echo "$RUNS_RESP" | sed '$d')

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "ERROR: Could not fetch runs (HTTP ${HTTP_CODE}):"
  echo "$RUNS_RESP" | jq . 2>/dev/null || echo "$RUNS_RESP"
  exit 1
fi

RUNS=$(echo "$RUNS_RESP" | jq -r '.pipeline_runs[]? | .id')

if [[ -z "$RUNS" ]]; then
  echo "No active runs found."
  exit 0
fi

COUNT=$(echo "$RUNS" | wc -l | tr -d ' ')
echo "Found ${COUNT} active run(s)."

# ── cancel each run ──────────────────────────────────────────────────────────

STOPPED=0
FAILED=0

while IFS= read -r run_id; do
  echo "  CANCEL ${run_id}"

  if [[ "$DRY_RUN" == "false" ]]; then
    RESP=$(curl -s -w "\n%{http_code}" -X POST \
      -H "Authorization: ${IAM_TOKEN}" \
      -H "Content-Type: application/json" \
      -H "Accept: application/json" \
      -d '{"status":"cancelled"}' \
      "${API_BASE}/tekton_pipelines/${PIPELINE_ID}/pipeline_runs/${run_id}/cancel")
    CODE=$(echo "$RESP" | tail -1)
    BODY=$(echo "$RESP" | sed '$d')
    if [[ "$CODE" != "200" && "$CODE" != "204" ]]; then
      echo "    ERROR (HTTP ${CODE}): $(echo "$BODY" | jq -r '.message // .' 2>/dev/null || echo "$BODY")"
      FAILED=$((FAILED + 1))
      continue
    fi
    echo "    OK"
  fi

  STOPPED=$((STOPPED + 1))
done <<< "$RUNS"

echo ""
echo "Done. Cancelled: ${STOPPED}  Failed: ${FAILED}"
