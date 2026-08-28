#!/usr/bin/env bash
# (c) Copyright IBM Corp. 2026
#
# Creates SCM triggers for PR and main-commit pipelines.
#
# PR triggers    → .sps/pr/pipeline-config-*.yaml   → pr-listener   → pull_request event
# Main triggers  → .sps/main/pipeline-config-*.yaml → ci-listener   → push event (branch: main)
#
# Usage:
#   .sps/scripts/create-triggers.sh [--dry-run]
#
# Prerequisites:
#   - ibmcloud CLI installed and logged in
#   - jq installed

set -euo pipefail

TOOLCHAIN_ID="579d9c4d-163d-4171-be94-9535ff3f68c4"
REGION="us-south"
REPO_URL="https://github.com/instana/nodejs.git"
SPS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  echo ">>> DRY RUN — no API calls will be made <<<"
  echo ""
fi

# ── auth ─────────────────────────────────────────────────────────────────────

echo "Fetching IBM Cloud IAM token..."
IAM_TOKEN=$(ibmcloud iam oauth-tokens --output json | jq -r '.iam_token')
if [[ -z "$IAM_TOKEN" || "$IAM_TOKEN" == "null" ]]; then
  echo "ERROR: Could not retrieve IAM token. Run 'ibmcloud login' first."
  exit 1
fi

API_BASE="https://api.${REGION}.devops.cloud.ibm.com/pipeline/v2"

# ── get pipeline ID ───────────────────────────────────────────────────────────

echo "Fetching pipeline ${TOOLCHAIN_ID}..."
PIPELINE_RESP=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: ${IAM_TOKEN}" \
  -H "Accept: application/json" \
  "${API_BASE}/tekton_pipelines/${TOOLCHAIN_ID}")
HTTP_CODE=$(echo "$PIPELINE_RESP" | tail -1)
PIPELINE_RESP=$(echo "$PIPELINE_RESP" | sed '$d')
if [[ "$HTTP_CODE" != "200" ]]; then
  echo "ERROR: Could not fetch pipeline (HTTP ${HTTP_CODE})"
  exit 1
fi
PIPELINE_ID=$(echo "$PIPELINE_RESP" | jq -r '.id // empty')
[[ -z "$PIPELINE_ID" ]] && PIPELINE_ID="$TOOLCHAIN_ID"
echo "Pipeline ID: ${PIPELINE_ID}"

# ── fetch existing triggers ───────────────────────────────────────────────────

echo "Fetching existing triggers..."
EXISTING=$(curl -s \
  -H "Authorization: ${IAM_TOKEN}" \
  -H "Accept: application/json" \
  "${API_BASE}/tekton_pipelines/${PIPELINE_ID}/triggers" 2>/dev/null || echo '{"triggers":[]}')

CREATED=0
SKIPPED=0

# ── helpers ───────────────────────────────────────────────────────────────────

create_manual_trigger() {
  local trigger_name="$1"
  local config_path="$2"
  local node_version="$3"

  local exists
  exists=$(echo "$EXISTING" | jq -r --arg n "$trigger_name" \
    '.triggers[]? | select(.name == $n) | .name' 2>/dev/null || true)
  if [[ -n "$exists" ]]; then
    echo "  SKIP  ${trigger_name} (already exists)"
    SKIPPED=$((SKIPPED + 1))
    return
  fi

  local PAYLOAD
  PAYLOAD=$(jq -n \
    --arg name       "$trigger_name" \
    --arg config     "$config_path" \
    --arg node_ver   "$node_version" \
    '{
      type: "manual",
      name: $name,
      event_listener: "ci-listener",
      properties: [
        { name: "pipeline-config",       value: $config,   type: "text" },
        { name: "node-version",          value: $node_ver, type: "text" },
        { name: "skip-merge-pr-to-base", value: "true",    type: "text" },
        { name: "opt-in-pr-updates",     value: "0",       type: "text" }
      ]
    }')

  echo "  CREATE ${trigger_name}  →  ${config_path}  (node ${node_version})"

  if [[ "$DRY_RUN" == "false" ]]; then
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
      -H "Authorization: ${IAM_TOKEN}" \
      -H "Content-Type: application/json" \
      -H "Accept: application/json" \
      -d "$PAYLOAD" \
      "${API_BASE}/tekton_pipelines/${PIPELINE_ID}/triggers")
    HTTP_CODE=$(echo "$RESPONSE" | tail -1)
    RESPONSE=$(echo "$RESPONSE" | sed '$d')
    if [[ "$HTTP_CODE" != "201" && "$HTTP_CODE" != "200" ]]; then
      echo "    ERROR (HTTP ${HTTP_CODE}): $(echo "$RESPONSE" | jq -r '.message // .' 2>/dev/null || echo "$RESPONSE")"
      return
    fi
    echo "    OK  id=$(echo "$RESPONSE" | jq -r '.id // "?"')"
  fi

  CREATED=$((CREATED + 1))
}

create_trigger() {
  local trigger_name="$1"
  local config_path="$2"
  local listener="$3"   # pr-listener | ci-listener
  local events="$4"     # JSON array string, e.g. '["pull_request"]'

  local exists
  exists=$(echo "$EXISTING" | jq -r --arg n "$trigger_name" \
    '.triggers[]? | select(.name == $n) | .name' 2>/dev/null || true)
  if [[ -n "$exists" ]]; then
    echo "  SKIP  ${trigger_name} (already exists)"
    SKIPPED=$((SKIPPED + 1))
    return
  fi

  local PAYLOAD
  PAYLOAD=$(jq -n \
    --arg  name     "$trigger_name" \
    --arg  repo     "$REPO_URL" \
    --arg  config   "$config_path" \
    --arg  listener "$listener" \
    --argjson events "$events" \
    '{
      type: "scm",
      name: $name,
      event_listener: $listener,
      events: $events,
      disable_draft_events: false,
      enable_events_from_forks: false,
      source: {
        type: "git",
        properties: { url: $repo, branch: "main" }
      },
      properties: [
        { name: "pipeline-config",       value: $config, type: "text" },
        { name: "skip-merge-pr-to-base", value: "true",  type: "text" },
        { name: "opt-in-pr-updates",     value: "0",     type: "text" }
      ]
    }')

  echo "  CREATE ${trigger_name}  →  ${config_path}"

  if [[ "$DRY_RUN" == "false" ]]; then
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
      -H "Authorization: ${IAM_TOKEN}" \
      -H "Content-Type: application/json" \
      -H "Accept: application/json" \
      -d "$PAYLOAD" \
      "${API_BASE}/tekton_pipelines/${PIPELINE_ID}/triggers")
    HTTP_CODE=$(echo "$RESPONSE" | tail -1)
    RESPONSE=$(echo "$RESPONSE" | sed '$d')
    if [[ "$HTTP_CODE" != "201" && "$HTTP_CODE" != "200" ]]; then
      echo "    ERROR (HTTP ${HTTP_CODE}): $(echo "$RESPONSE" | jq -r '.message // .' 2>/dev/null || echo "$RESPONSE")"
      return
    fi
    echo "    OK  id=$(echo "$RESPONSE" | jq -r '.id // "?"')"
  fi

  CREATED=$((CREATED + 1))
}

# ── PR triggers (.sps/pr/) ────────────────────────────────────────────────────

echo ""
echo "── PR triggers (pr-listener, pull_request) ──────────────────────────────"

for yaml_file in "${SPS_DIR}/pr"/pipeline-config*.yaml; do
  [[ -f "$yaml_file" ]] || continue
  filename="$(basename "$yaml_file")"
  name="${filename#pipeline-config-}"
  name="${name%.yaml}"
  # default config has no suffix → use "security-checks"
  [[ "$name" == "pipeline-config" || "$name" == "" ]] && name="security-checks"
  create_trigger "pr-${name}" ".sps/pr/${filename}" "pr-listener" '["pull_request"]'
done

# ── Main triggers (.sps/main/) ────────────────────────────────────────────────

echo ""
echo "── Main triggers (ci-listener, push) ────────────────────────────────────"

for yaml_file in "${SPS_DIR}/main"/pipeline-config*.yaml; do
  [[ -f "$yaml_file" ]] || continue
  filename="$(basename "$yaml_file")"
  name="${filename#pipeline-config-}"
  name="${name%.yaml}"
  [[ "$name" == "pipeline-config" || "$name" == "" ]] && name="security-checks"
  create_trigger "main-${name}" ".sps/main/${filename}" "ci-listener" '["push"]'
done

# ── Manual triggers (.sps/manual/) ───────────────────────────────────────────

echo ""
echo "── Manual triggers (ci-listener, type: manual) ──────────────────────────"

for yaml_file in "${SPS_DIR}/manual"/pipeline-config*.yaml; do
  [[ -f "$yaml_file" ]] || continue
  filename="$(basename "$yaml_file")"
  name="${filename#pipeline-config-}"
  name="${name%.yaml}"
  [[ "$name" == "pipeline-config" || "$name" == "" ]] && name="security-checks"
  # Default node-version for the trigger property (can be overridden at run time)
  create_manual_trigger "manual-${name}" ".sps/manual/${filename}" "20"
done

echo ""
echo "Done. Created: ${CREATED}  Skipped (already exist): ${SKIPPED}"
