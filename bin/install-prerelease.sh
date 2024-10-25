#!/bin/bash

PRERELEASE_NODE_VERSION=$1

fetch_latest_prerelease_node_version() {
  local latest_version
  
  latest_version=$(curl -sL https://nodejs.org/dist/index.json | jq -r '[.[]][0].version')
  latest_version=${latest_version#v}
  IFS='.' read -r major minor patch <<< "$latest_version"
  
  major=$((major + 1))
  
  echo "${major}"
}

# Check if PRERELEASE_NODE_VERSION is set; if not, set it to the latest prerelease
if [ -z "$PRERELEASE_NODE_VERSION" ]; then
  PRERELEASE_NODE_VERSION=$(fetch_latest_prerelease_node_version)
fi

echo "Installing Node.js prerelease version $PRERELEASE_NODE_VERSION..."

if ! command -v nvm &> /dev/null; then
  if ! curl -sSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash &> /dev/null; then
    echo "Failed to install NVM."
    exit 1
  fi  
fi

source "$HOME/.nvm/nvm.sh"

NVM_NODEJS_ORG_MIRROR="https://nodejs.org/download/rc"
if ! nvm install "$PRERELEASE_NODE_VERSION" &> /dev/null; then
  echo "RC installation failed. Trying Nightly mirror..."

  NVM_NODEJS_ORG_MIRROR="https://nodejs.org/download/nightly"
  if ! nvm install "$PRERELEASE_NODE_VERSION" &> /dev/null; then
    echo "Installation failed with both RC and Nightly mirrors."
    exit 1
  fi
fi
