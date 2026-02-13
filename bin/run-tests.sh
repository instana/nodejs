#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2021
#######################################

set -eo pipefail

WATCH=false
SCOPE=""
PACKAGE=""
VERSION=""
GREP_PATTERN=""
TEST_FILES=""
TEST_NAME_FILTER=""

# Helper function to normalize package names to folder names
# e.g., '@redis/client' becomes 'redis_client'
normalize_folder_name() {
  echo "$1" | sed 's|^@||' | sed 's|/|_|g'
}

for arg in "$@"; do
  case $arg in
  --watch)
    WATCH=true
    shift
    ;;
  --esm)
    export RUN_ESM=true
    shift
    ;;
  --scope=*)
    SCOPE="${arg#*=}"
    shift
    ;;
  *)
    # Check if arg contains @ but NOT at the beginning (version separator)
    # If @ is at the beginning, it's a scoped package name
    if [[ $arg == @* ]]; then
      # Scoped package - check if there's a version separator after the package name
      # Pattern: @scope/name@version
      if [[ $arg =~ ^(@[^@]+)@(.+)$ ]]; then
        PACKAGE="${BASH_REMATCH[1]}"
        VERSION="${BASH_REMATCH[2]}"
      else
        PACKAGE="$arg"
      fi
    elif [[ $arg == *"@"* ]]; then
      # Non-scoped package with version
      PACKAGE="${arg%@*}"
      VERSION="${arg#*@}"
    elif [ -n "$PACKAGE" ]; then
      TEST_NAME_FILTER="$arg"
    else
      PACKAGE="$arg"
    fi
    shift
    ;;
  esac
done

args=""

if [ "$WATCH" = true ]; then
  args="-- --watch"
fi

npm_command="npm run test:debug"

# Derive test base directory from SCOPE (e.g., @instana/collector -> packages/collector/test)
SCOPE_PKG_NAME="${SCOPE#@instana/}"
TEST_BASE_DIR="packages/${SCOPE_PKG_NAME}/test"

if [ -n "$PACKAGE" ]; then
  # Normalize package name for scoped packages (e.g., @redis/client -> redis_client)
  NORMALIZED_PACKAGE=$(normalize_folder_name "$PACKAGE")
  
  PACKAGE_DIR=$(find "$TEST_BASE_DIR" -type d \( -path "*/$PACKAGE" -o -path "*/$NORMALIZED_PACKAGE" \) ! -path "*/node_modules/*" ! -path "*/_v*" 2>/dev/null | head -1)
  
  if [ -z "$PACKAGE_DIR" ]; then
    # No directory found — try matching a test file by name (e.g. cmdline -> cmdline.test.js or cmdline_test.js)
    MATCH_FILE=$(find "$TEST_BASE_DIR" -type f \( -name "${PACKAGE}.test.js" -o -name "${PACKAGE}_test.js" -o -name "${PACKAGE}.test.mjs" -o -name "${PACKAGE}_test.mjs" \) ! -path "*/node_modules/*" ! -path "*/_v*" 2>/dev/null | head -1)
    if [ -n "$MATCH_FILE" ]; then
      RELATIVE_FILE=$(echo "$MATCH_FILE" | sed "s|packages/${SCOPE_PKG_NAME}/||g")
      echo "Running test file: $RELATIVE_FILE"
      npm_command="npm run test:debug:files -- $RELATIVE_FILE"
      npx lerna exec --scope="$SCOPE" "$npm_command $args"
      exit $?
    fi
    echo "Error: Test folder or file for '$PACKAGE' not found"
    exit 1
  fi
  
  ACTUAL_PACKAGE=$(basename "$PACKAGE_DIR")
  
  AVAILABLE_VERSIONS=$(find "$PACKAGE_DIR" -maxdepth 1 -type d -name "_v*" 2>/dev/null | sed 's/.*_v/v/' | sort -V | tr '\n' ', ' | sed 's/,$//')

  if [ -n "$VERSION" ]; then
    if [[ ! $VERSION =~ ^v ]]; then
      VERSION="v$VERSION"
    fi

    if [[ $VERSION =~ ^v[0-9]+$ ]]; then
      FULL_VERSION=$(find "$PACKAGE_DIR" -maxdepth 1 -type d -name "_${VERSION}.*" 2>/dev/null | sed 's/.*_v//' | sort -V | tail -1)
      if [ -n "$FULL_VERSION" ]; then
        VERSION="v$FULL_VERSION"
      fi
    fi

    if [ ! -d "$PACKAGE_DIR/_${VERSION}" ]; then
      echo "Error: Version not found. We only have: $AVAILABLE_VERSIONS"
      exit 1
    fi

    GREP_PATTERN="$ACTUAL_PACKAGE@$VERSION"
    
    # Check for test files in the version directory
    SEARCH_PATTERN="*.test.js"
    if [ -n "$TEST_NAME_FILTER" ]; then
        SEARCH_PATTERN="*${TEST_NAME_FILTER}*.test.js"
    fi
    FOUND_FILES=$(find "$PACKAGE_DIR/_${VERSION}" -maxdepth 2 -name "$SEARCH_PATTERN" ! -name "test_base.js")
    if [ -n "$FOUND_FILES" ]; then
        TEST_FILES=$(echo "$FOUND_FILES" | tr '\n' ' ')
    fi

  else
    HIGHEST_VERSION=$(find "$PACKAGE_DIR" -maxdepth 1 -type d -name "_v*" 2>/dev/null | sed 's/.*_v//' | sort -V | tail -1)
    if [ -n "$HIGHEST_VERSION" ]; then
      GREP_PATTERN="$ACTUAL_PACKAGE@v$HIGHEST_VERSION"
      
      # Check for test files in the highest version directory
      SEARCH_PATTERN="*.test.js"
      if [ -n "$TEST_NAME_FILTER" ]; then
          SEARCH_PATTERN="*${TEST_NAME_FILTER}*.test.js"
      fi
      FOUND_FILES=$(find "$PACKAGE_DIR/_v${HIGHEST_VERSION}" -maxdepth 2 -name "$SEARCH_PATTERN" ! -name "test_base.js")
      if [ -n "$FOUND_FILES" ]; then
          TEST_FILES=$(echo "$FOUND_FILES" | tr '\n' ' ')
      fi

    else
      GREP_PATTERN="$ACTUAL_PACKAGE@v"
      
      # Fallback for non-versioned packages (supports both *.test.js and *_test.js conventions)
      if [ -f "$PACKAGE_DIR/default.test.js" ]; then
          TEST_FILES="$PACKAGE_DIR/default.test.js"
      elif [ -f "$PACKAGE_DIR/test.js" ]; then
          TEST_FILES="$PACKAGE_DIR/test.js"
      else
          TEST_FILES=$(find "$PACKAGE_DIR" \( -name "*.test.js" -o -name "*_test.js" \) ! -path "*/node_modules/*" ! -name "test_base.js" | tr '\n' ' ')
      fi
    fi
  fi
  
  if [ -n "$TEST_FILES" ]; then
      # Make paths relative to the package directory for the npm script
      RELATIVE_TEST_FILES=$(echo "$TEST_FILES" | sed "s|packages/${SCOPE_PKG_NAME}/||g")
      
      # Use test:debug:files to run only the specific files
      npm_command="npm run test:debug:files -- $RELATIVE_TEST_FILES"
      
      
      # We still pass grep pattern just in case, though mocha might not need it if we pass specific files
      # But usually filtering by file is enough.
      # args="-- --grep \"$GREP_PATTERN\" $args"
      
      echo "Running tests for $ACTUAL_PACKAGE${VERSION:+ version $VERSION}"
      echo "Target files: $RELATIVE_TEST_FILES"
  else
      # If we couldn't determine specific files, fall back to old behavior but warn
      args="-- --grep \"$GREP_PATTERN\" $args"
      echo "Running tests for $ACTUAL_PACKAGE${VERSION:+ version $VERSION} (grep pattern: $GREP_PATTERN)"
      echo "Warning: Could not identify specific test files, running full suite with filter."
  fi

else
  echo "Running all tests with $SCOPE $args"
fi

npx lerna exec --scope="$SCOPE" "$npm_command $args"
