#!/usr/bin/env bash
# (c) Copyright IBM Corp. 2026
#
# Removes ALL triggers from the nodejs toolchain.
#
# Usage:
#   .sps/scripts/remove-all-triggers.sh [--dry-run]
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

# ── fetch triggers ───────────────────────────────────────────────────────────

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

TRIGGERS=$(echo "$BODY" | jq -r '.triggers[]? | "\(.id) \(.name)"')

if [[ -z "$TRIGGERS" ]]; then
  echo "No triggers found."
  exit 0
fi

COUNT=$(echo "$TRIGGERS" | wc -l | tr -d ' ')
echo "Found ${COUNT} trigger(s):"
echo "$TRIGGERS" | while IFS= read -r line; do echo "  $line"; done
echo ""

# ── delete each trigger ──────────────────────────────────────────────────────

DELETED=0
FAILED=0

while IFS= read -r line; do
  trigger_id=$(echo "$line" | awk '{print $1}')
  trigger_name=$(echo "$line" | awk '{$1=""; print $0}' | xargs)

  echo "  DELETE ${trigger_name} (${trigger_id})"

  if [[ "$DRY_RUN" == "false" ]]; then
    RESP=$(curl -s -w "\n%{http_code}" -X DELETE \
      -H "Authorization: ${IAM_TOKEN}" \
      -H "Accept: application/json" \
      "${API_BASE}/tekton_pipelines/${PIPELINE_ID}/triggers/${trigger_id}")
    CODE=$(echo "$RESP" | tail -1)
    RBODY=$(echo "$RESP" | sed '$d')
    if [[ "$CODE" != "204" && "$CODE" != "200" ]]; then
      echo "    ERROR (HTTP ${CODE}): $(echo "$RBODY" | jq -r '.message // .' 2>/dev/null || echo "$RBODY")"
      FAILED=$((FAILED + 1))
      continue
    fi
    echo "    OK"
  fi

  DELETED=$((DELETED + 1))
done <<< "$TRIGGERS"

echo ""
echo "Done. Deleted: ${DELETED}  Failed: ${FAILED}"
