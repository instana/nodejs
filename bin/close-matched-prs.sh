#!/bin/bash

REPO="instana/instana-issues"

TITLE_PATTERN="$1"
DRY_RUN="${2:-true}"

if [[ -z "$TITLE_PATTERN" ]]; then
  echo "Usage: $0 <title-pattern> [dry-run]"
  echo "Example: $0 \"CVE-2025-14505\" true"
  echo "Example: $0 \"CVE-2025-14505\" false"
  exit 1
fi

if [[ "$DRY_RUN" != "true" && "$DRY_RUN" != "false" ]]; then
  echo "Error: dry-run must be 'true' or 'false'"
  exit 1
fi

echo "Repository: $REPO"
echo "Title pattern: $TITLE_PATTERN"
echo "Dry run: $DRY_RUN"
echo

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
echo "---------------------"

while IFS=$'\t' read -r ISSUE_NUMBER ISSUE_TITLE ISSUE_URL; do
  echo "#$ISSUE_NUMBER"
  echo "Title: $ISSUE_TITLE"
  echo "URL:   $ISSUE_URL"
  echo
done <<< "$MATCHING_ISSUES"

if [[ "$DRY_RUN" == "true" ]]; then
  echo "[DRY RUN] No issues were modified."
  exit 0
fi

echo "The above issues will be commented and closed."
read -r -p "Continue? [y/N] " CONFIRM

if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
  echo "Aborted. No issues were modified."
  exit 0
fi

echo

while IFS=$'\t' read -r ISSUE_NUMBER ISSUE_TITLE ISSUE_URL; do
  echo "Processing #$ISSUE_NUMBER: $ISSUE_TITLE"

  if gh issue comment "$ISSUE_NUMBER" \
      --repo "$REPO" \
      --body "fixed the case"; then

    if gh issue close "$ISSUE_NUMBER" --repo "$REPO"; then
      echo "✓ Commented and closed #$ISSUE_NUMBER"
    else
      echo "✗ Comment added, but failed to close #$ISSUE_NUMBER"
    fi

  else
    echo "✗ Failed to add comment to #$ISSUE_NUMBER. Issue was NOT closed."
  fi

  echo

done <<< "$MATCHING_ISSUES"

echo "Done."