#!/usr/bin/env bash
# (c) Copyright IBM Corp. 2026
#
# Creates one PR trigger per pipeline-config-*.yaml in this directory.
#
# Usage:
#   .sps/create-triggers.sh [--dry-run]
#
# Prerequisites:
#   - ibmcloud CLI installed and logged in (ibmcloud login)
#   - jq installed
#
# Each trigger will be configured with:
#   - type: scm
#   - event: pull_request (open + update)
#   - repo: https://github.com/instana/nodejs.git
#   - draft PRs: enabled
#   - pipeline-config-filename: .sps/pipeline-config-<name>.yaml

set -euo pipefail

TOOLCHAIN_ID="579d9c4d-163d-4171-be94-9535ff3f68c4"
REGION="us-south"
REPO_URL="https://github.com/instana/nodejs.git"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

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

# ── get pipeline ID for this toolchain ──────────────────────────────────────

echo "Fetching Tekton pipelines for toolchain ${TOOLCHAIN_ID}..."
PIPELINES_RESP=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: ${IAM_TOKEN}" \
  -H "Accept: application/json" \
  "${API_BASE}/tekton_pipelines/${TOOLCHAIN_ID}")

HTTP_CODE=$(echo "$PIPELINES_RESP" | tail -1)
PIPELINES_RESP=$(echo "$PIPELINES_RESP" | sed '$d')

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "ERROR: Could not fetch pipeline info (HTTP ${HTTP_CODE}):"
  echo "$PIPELINES_RESP" | jq . 2>/dev/null || echo "$PIPELINES_RESP"
  exit 1
fi

PIPELINE_ID=$(echo "$PIPELINES_RESP" | jq -r '.id // empty')
if [[ -z "$PIPELINE_ID" ]]; then
  PIPELINE_ID="$TOOLCHAIN_ID"
fi
echo "Pipeline ID: ${PIPELINE_ID}"

# ── list existing triggers to avoid duplicates ──────────────────────────────

echo "Fetching existing triggers..."
EXISTING=$(curl -s \
  -H "Authorization: ${IAM_TOKEN}" \
  -H "Accept: application/json" \
  "${API_BASE}/tekton_pipelines/${PIPELINE_ID}/triggers" 2>/dev/null || echo '{"triggers":[]}')

# ── create triggers ──────────────────────────────────────────────────────────

# ── helper: create one trigger ───────────────────────────────────────────────

create_trigger() {
  local trigger_name="$1"
  local config_path="$2"

  local exists
  exists=$(echo "$EXISTING" | jq -r --arg n "$trigger_name" '.triggers[]? | select(.name == $n) | .name' 2>/dev/null || true)
  if [[ -n "$exists" ]]; then
    echo "  SKIP  ${trigger_name} (already exists)"
    SKIPPED=$((SKIPPED + 1))
    return
  fi

  local PAYLOAD
  PAYLOAD=$(jq -n \
    --arg name "$trigger_name" \
    --arg repo "$REPO_URL" \
    --arg config "$config_path" \
    '{
      type: "scm",
      name: $name,
      event_listener: "pr-listener",
      events: ["pull_request", "push"],
      disable_draft_events: false,
      enable_events_from_forks: false,
      source: {
        type: "git",
        properties: {
          url: $repo,
          branch: "main"
        }
      },
      properties: [
        {
          name: "pipeline-config",
          value: $config,
          type: "text"
        },
        {
          name: "skip-merge-pr-to-base",
          value: "true",
          type: "text"
        },
        {
          name: "opt-in-pr-updates",
          value: "0",
          type: "text"
        }
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

CREATED=0
SKIPPED=0

# ── create default security-checks trigger ───────────────────────────────────

create_trigger "security-checks" ".sps/pipeline-config.yaml"

# ── create per-yaml triggers ──────────────────────────────────────────────────

YAML_FILES=("$SCRIPT_DIR"/pipeline-config-*.yaml)
# exclude the default pipeline-config.yaml (no suffix)
YAML_FILES=("${YAML_FILES[@]/pipeline-config.yaml/}")

for yaml_file in "${YAML_FILES[@]}"; do
  [[ -f "$yaml_file" ]] || continue

  filename="$(basename "$yaml_file")"
  # strip pipeline-config- prefix and .yaml suffix to get the name
  name="${filename#pipeline-config-}"
  name="${name%.yaml}"

  create_trigger "$name" ".sps/${filename}"
done

echo ""
echo "Done. Created: ${CREATED}  Skipped (already exist): ${SKIPPED}"
