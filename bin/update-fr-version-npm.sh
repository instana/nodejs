#######################################
# (c) Copyright IBM Corp. 2026
#######################################
#
# Update FedRAMP tag for all public packages in NPM registry
#
# Examples:
#   ./update-fr-version-npm.sh 5.4.1
#   ./update-fr-version-npm.sh 5.4.1 --dry-run
#

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <version> [--dry-run]"
  echo "Example: $0 5.4.1"
  echo "Example: $0 5.4.1 --dry-run"
  exit 1
fi

VERSION="$1"
DRY_RUN=false

if [ "$2" = "--dry-run" ]; then
  DRY_RUN=true
fi

PACKAGES_DIR="$(dirname "$0")/../packages"

if [ "$DRY_RUN" = true ]; then
  echo "🔍 DRY-RUN MODE - No changes will be made"
fi
echo "Updating FedRAMP tag for version: $VERSION"
echo "---"

for package_dir in "$PACKAGES_DIR"/*; do
  if [ -d "$package_dir" ]; then
    package_json="$package_dir/package.json"

    if [ -f "$package_json" ]; then
      is_private=$(grep '"private"' "$package_json" | grep -i 'true' || echo "")

      if [ -n "$is_private" ]; then
        package_name=$(grep '"name"' "$package_json" | head -1 | sed 's/.*"name": "\(.*\)".*/\1/')
        echo "⊘ Skipping $package_name (marked as private)"
        continue
      fi

      package_name=$(grep '"name"' "$package_json" | head -1 | sed 's/.*"name": "\(.*\)".*/\1/')

      if [ -n "$package_name" ]; then
        echo "Adding fedramp tag to $package_name@$VERSION"
        if [ "$DRY_RUN" = true ]; then
          echo "  [DRY-RUN] npm dist-tag add $package_name@$VERSION fedramp"
        else
          npm dist-tag add "$package_name@$VERSION" fedramp
        fi
        echo "✓ $package_name@$VERSION tagged with fedramp"
      fi
    fi
  fi
done

echo "---"
echo "✓ All packages have been updated with fedramp tag"
