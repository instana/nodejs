#!/usr/bin/env bash
# (c) Copyright IBM Corp. 2026
#
# Closes compliance issues reported by SPS in the IBM GitHub instana/instana-issues
# repository. Matches issues by title substring, posts a comment, then closes them.
#
# Usage:
#   .sps/scripts/close-compliance-reports.sh --pattern <substring> [--comment <text>] [--dry-run]
#
# Options:
#   --pattern   Title substring to match against open issues (required)
#   --comment   Comment body posted before closing each issue.
#               If omitted, the script prompts; press Enter to accept the default.
#   --dry-run   List matching issues without modifying anything
#
# Prerequisites:
#   - GitHub CLI (gh) installed and authenticated with access to instana/instana-issues

set -euo pipefail

REPO="instana/instana-issues"
DEFAULT_COMMENT="fixed the case"

TITLE_PATTERN=""
COMMENT=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pattern)  TITLE_PATTERN="$2"; shift 2 ;;
    --comment)  COMMENT="$2";       shift 2 ;;
    --dry-run)  DRY_RUN=true;       shift   ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 --pattern <substring> [--comment <text>] [--dry-run]"
      exit 1
      ;;
  esac
done

if [[ -z "$TITLE_PATTERN" ]]; then
  echo "ERROR: --pattern is required."
  echo ""
  echo "Usage: $0 --pattern <substring> [--comment <text>] [--dry-run]"
  exit 1
fi

if [[ -z "$COMMENT" && "$DRY_RUN" == "false" ]]; then
  read -r -p "Comment [default: \"${DEFAULT_COMMENT}\"]: " USER_COMMENT
  COMMENT="${USER_COMMENT:-${DEFAULT_COMMENT}}"
fi

echo "Repository:    ${REPO}"
echo "Title pattern: ${TITLE_PATTERN}"
echo "Dry run:       ${DRY_RUN}"
[[ "$DRY_RUN" == "false" ]] && echo "Comment:       ${COMMENT}"
echo ""

MATCHING_ISSUES=$(gh issue list \
  --repo "$REPO" \
  --state open \
  --limit 1000 \
  --json number,title,url \
  --jq ".[] | select(.title | contains(\"$TITLE_PATTERN\")) | [.number, .title, .url] | @tsv")

if [[ -z "$MATCHING_ISSUES" ]]; then
  echo "No matching open issues found."
  exit 0
fi

echo "Matching open issues:"
while IFS=$'\t' read -r ISSUE_NUMBER ISSUE_TITLE ISSUE_URL; do
  echo "  #${ISSUE_NUMBER}  ${ISSUE_TITLE}  ${ISSUE_URL}"
done <<< "$MATCHING_ISSUES"
echo ""

if [[ "$DRY_RUN" == "true" ]]; then
  echo "[DRY RUN] No issues were modified."
  exit 0
fi

read -r -p "The above issues will be commented and closed. Continue? [y/N] " CONFIRM
[[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]] && { echo "Aborted."; exit 0; }
echo ""

while IFS=$'\t' read -r ISSUE_NUMBER ISSUE_TITLE ISSUE_URL; do
  echo "Processing #${ISSUE_NUMBER}: ${ISSUE_TITLE}"
  if gh issue comment "$ISSUE_NUMBER" --repo "$REPO" --body "$COMMENT"; then
    if gh issue close "$ISSUE_NUMBER" --repo "$REPO"; then
      echo "  ✓ Commented and closed #${ISSUE_NUMBER}"
    else
      echo "  ✗ Comment added, but failed to close #${ISSUE_NUMBER}"
    fi
  else
    echo "  ✗ Failed to add comment to #${ISSUE_NUMBER}. Issue was NOT closed."
  fi
done <<< "$MATCHING_ISSUES"

echo ""
echo "Done."
