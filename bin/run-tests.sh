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

for arg in "$@"; do
  case $arg in
  --watch)
    WATCH=true
    shift
    ;;
  --scope=*)
    SCOPE="${arg#*=}"
    shift
    ;;
  *)
    if [[ $arg == *"@"* ]]; then
      PACKAGE="${arg%@*}"
      VERSION="${arg#*@}"
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

if [ -n "$PACKAGE" ]; then
  if [ -d "packages/collector/test/tracing/$PACKAGE" ]; then
    PACKAGE_DIR="packages/collector/test/tracing/$PACKAGE"
  else
    PACKAGE_DIR=$(find "packages/collector/test/tracing" -mindepth 2 -maxdepth 2 -type d -name "$PACKAGE" 2>/dev/null | head -1)
  fi
  
  if [ -z "$PACKAGE_DIR" ]; then
    echo "Error: Package '$PACKAGE' not found in any tracing category"
    exit 1
  fi
  
  ACTUAL_PACKAGE=$(basename "$PACKAGE_DIR")
  
  AVAILABLE_VERSIONS=$(find "$PACKAGE_DIR" -maxdepth 1 -type d -name "_v*" 2>/dev/null | sed 's/.*_v/v/' | sort -V | tr '\n' ', ' | sed 's/,$//')

  if [ -n "$VERSION" ]; then
    if [[ ! $VERSION =~ ^v ]]; then
      VERSION="v$VERSION"
    fi

    if [ ! -d "$PACKAGE_DIR/_${VERSION}" ]; then
      echo "Error: Version not found. We only have: $AVAILABLE_VERSIONS"
      exit 1
    fi

    GREP_PATTERN="tracing/$ACTUAL_PACKAGE@$VERSION"
    
    # Check for test files in the version directory
    if [ -f "$PACKAGE_DIR/_${VERSION}/test.js" ]; then
        TEST_FILES="$PACKAGE_DIR/_${VERSION}/test.js"
    elif [ -f "$PACKAGE_DIR/_${VERSION}/${ACTUAL_PACKAGE}_test.js" ]; then
        TEST_FILES="$PACKAGE_DIR/_${VERSION}/${ACTUAL_PACKAGE}_test.js"
    fi

  else
    HIGHEST_VERSION=$(find "$PACKAGE_DIR" -maxdepth 1 -type d -name "_v*" 2>/dev/null | sed 's/.*_v//' | sort -n | tail -1)
    if [ -n "$HIGHEST_VERSION" ]; then
      GREP_PATTERN="tracing/$ACTUAL_PACKAGE@v$HIGHEST_VERSION"
      
      # Check for test files in the highest version directory
      if [ -f "$PACKAGE_DIR/_v${HIGHEST_VERSION}/test.js" ]; then
          TEST_FILES="$PACKAGE_DIR/_v${HIGHEST_VERSION}/test.js"
      elif [ -f "$PACKAGE_DIR/_v${HIGHEST_VERSION}/${ACTUAL_PACKAGE}_test.js" ]; then
          TEST_FILES="$PACKAGE_DIR/_v${HIGHEST_VERSION}/${ACTUAL_PACKAGE}_test.js"
      fi

    else
      GREP_PATTERN="tracing/$ACTUAL_PACKAGE@v"
      
      # Fallback for non-versioned packages
      if [ -f "$PACKAGE_DIR/test.js" ]; then
          TEST_FILES="$PACKAGE_DIR/test.js"
      else
          # Fallback: all test.js files in that package directory
          TEST_FILES=$(find "$PACKAGE_DIR" -name "*test.js")
      fi
    fi
  fi
  
  if [ -n "$TEST_FILES" ]; then
      # Make paths relative to packages/collector for the npm script
      RELATIVE_TEST_FILES=$(echo "$TEST_FILES" | sed 's|packages/collector/||g')
      
      # Use test:debug:files to run only the specific files
      npm_command="npm run test:debug:files -- $RELATIVE_TEST_FILES"
      
      # If specific files are found (which are in collector), default scope to collector if not set
      if [ -z "$SCOPE" ]; then
        SCOPE="@instana/collector"
      fi
      
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
