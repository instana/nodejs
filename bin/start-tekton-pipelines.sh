#!/bin/bash

TEKTON_PROJECT_ID="c2cd6a8d-ea5a-47b0-913e-cd172d63833f"

EXCLUDED_TRIGGERS=(
  # "listener_node_20_weekly"
  # "listener_node_21_weekly"
)

NEXT_TRIGGER_IN_SECONDS=100
MONITORING_INTERVAL_IN_SECONDS=60

check_if_ibmcloud_installed() {
  if ! command -v ibmcloud &>/dev/null; then
    echo "❌ ibmcloud CLI is not installed."
    exit 1
  fi
}

check_login() {
  if ibmcloud target 2>&1 | grep "Not logged in"; then
    echo "❌ Not logged in to IBM Cloud."
    echo "👉 Please visit https://cloud.ibm.com and click login via CLI in the menu."
    exit 1
  else
    echo "✅ IBM Cloud login detected."
  fi
}

is_excluded() {
  local name="$1"
  for ex in "${EXCLUDED_TRIGGERS[@]}"; do
    [[ "$ex" == "$name" ]] && return 0
  done
  return 1
}

is_trigger_status() {
  local trigger_name="$1"
  local expected_status="$2"
  local input_data="$3"

  local found_trigger=""
  local current_status=""

  while IFS= read -r line; do
    if [[ $line == Trigger:* ]]; then
      found_trigger=$(echo "$line" | cut -d':' -f2- | xargs)
    elif [[ $line == Status:* && -n "$found_trigger" ]]; then
      current_status=$(echo "$line" | cut -d':' -f2- | xargs)

      if [[ "$found_trigger" == "$trigger_name" ]]; then
        if [[ "$current_status" == "$expected_status" ]]; then
          echo "yes"
          return 0
        else
          echo "no"
          return 1
        fi
      fi

      found_trigger=""
    fi
  done <<<"$input_data"

  echo "no"
  return 1
}

run_listener() {
  local listener_name="$1"
  echo "🚀 Running listener: $listener_name"

  TRIGGER_OUTPUT=$(ibmcloud dev tekton-trigger "$TEKTON_PROJECT_ID" --trigger-name "$listener_name" 2>&1)
  echo "$TRIGGER_OUTPUT"

  if [[ $? -ne 0 ]]; then
    return 1
  fi

  return 0
}

trigger_all() {
  echo "🔍 Fetching triggers from Tekton project..."
  TRIGGERS_OUTPUT=$(ibmcloud dev tekton-info "$TEKTON_PROJECT_ID")

  SELECTED_TRIGGERS=()
  while IFS= read -r line; do
    SELECTED_TRIGGERS+=("$line")
  done < <(echo "$TRIGGERS_OUTPUT" | awk '
  /Name:/ {name=$2}
  /Type:/ {
    if ($2 == "timer" && name ~ /^listener_(node|esm)_/) {
      print name
    }
  }')

  echo "📋 Found triggers:"
  printf " - %s\n" "${SELECTED_TRIGGERS[@]}"

  echo "📦 Checking current pipeline state to avoid duplicates..."
  RUNS_RAW=$(ibmcloud dev tekton-pipelineruns "$TEKTON_PROJECT_ID")

  for TRIGGER in "${SELECTED_TRIGGERS[@]}"; do
    if is_excluded "$TRIGGER"; then
      echo "⏭ Skipping excluded trigger: $TRIGGER"
      continue
    fi

    echo "🔍 Checking if trigger $TRIGGER is already running..."
    IS_RUNNING=$(is_trigger_status "$TRIGGER" "running" "$RUNS_RAW")

    if [[ "$IS_RUNNING" == "yes" ]]; then
      echo "⏭ $TRIGGER is already running – skipping."
      continue
    fi

    echo "🚀 Triggering: $TRIGGER"
    TRIGGER_OUTPUT=$(run_listener "$TRIGGER")

    if echo "$TRIGGER_OUTPUT" | grep -q "is disabled"; then
      echo "⚠️ $TRIGGER → trigger is disabled – skipping."
      continue
    elif echo "$TRIGGER_OUTPUT" | grep -q "FAILED"; then
      echo "❌ $TRIGGER → failed to trigger. Output:"
      echo "$TRIGGER_OUTPUT"
      continue
    else
      echo "✅ $TRIGGER triggered successfully"
      echo "🕒 Waiting $NEXT_TRIGGER_IN_SECONDS seconds before next trigger..."
      sleep $NEXT_TRIGGER_IN_SECONDS
    fi
  done

  monitor_trigger_runs "${SELECTED_TRIGGERS[@]}"
}

monitor_trigger_runs() {
  echo "\n\n"
  echo "############################################"
  echo "🔍 Monitoring pipeline run statuses..."
  echo "############################################"
  echo "\n\n"

  local TRIGGERS=("$@")

  RUNS_RAW=$(ibmcloud dev tekton-pipelineruns "$TEKTON_PROJECT_ID")

  local remaining=0

  for TRIGGER in "${TRIGGERS[@]}"; do
    echo "🔍 Checking status for trigger: $TRIGGER"
    IS_RUNNING=$(is_trigger_status "$TRIGGER" "running" "$RUNS_RAW")

    if [[ "$IS_RUNNING" == "yes" ]]; then
      echo "⏳ $TRIGGER is still running."
      ((remaining++))
      continue
    fi

    IS_FAILED=$(is_trigger_status "$TRIGGER" "failed" "$RUNS_RAW")

    if [[ "$IS_FAILED" == "yes" ]]; then
      echo "❌ $TRIGGER has failed."
      OUTPUT=$(run_listener "$TRIGGER")

      if echo "$OUTPUT" | grep -q "is disabled"; then
        echo "⚠️ $TRIGGER → trigger is disabled – cannot retrigger."
        continue
      fi

      echo "🔄 Retriggered listener: $TRIGGER"
      echo "$OUTPUT"
      ((remaining++))
      continue
    fi

    IS_CANCELLING=$(is_trigger_status "$TRIGGER" "cancelling" "$RUNS_RAW")

    if [[ "$IS_CANCELLING" == "yes" ]]; then
      echo "🚫 $TRIGGER is cancelling."
      ((remaining++))
      continue
    fi

    echo "✅ $TRIGGER has completed successfully."
  done

  if [[ $remaining -eq 0 ]]; then
    echo "🎉 All triggers have completed successfully."
    exit 0
  fi

  echo "🔁 Checking again in $MONITORING_INTERVAL_IN_SECONDS seconds..."
  sleep $MONITORING_INTERVAL_IN_SECONDS
  monitor_trigger_runs "${TRIGGERS[@]}"
}

check_if_ibmcloud_installed
check_login
trigger_all
