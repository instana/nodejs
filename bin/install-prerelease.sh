#!/bin/bash

CONFIGURED_PRERELEASE_NODE_VERSION=$1

fetch_latest_prerelease_node_version() {
  local latest_version
  
  latest_version=$(curl -sL https://nodejs.org/dist/index.json | jq -r '[.[]][0].version')
  latest_version=${latest_version#v}
  IFS='.' read -r major minor patch <<< "$latest_version"
  major=$((major + 1))
  echo "${major}"
}


if [ -z "$PRERELEASE_NODE_VERSION" ]; then
  PRERELEASE_NODE_VERSION=$(fetch_latest_prerelease_node_version)
else 
  PRERELEASE_NODE_VERSION=$CONFIGURED_PRERELEASE_NODE_VERSION
fi

if ! command -v nvm &> /dev/null; then
  if ! curl -sSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash &> /dev/null; then
    echo "Failed to install NVM."
    exit 1
  fi  
fi

source "$HOME/.nvm/nvm.sh"

install_node_version() {
  local PRERELEASE_NODE_VERSION=$1
  echo "Installing Node.js prerelease version $PRERELEASE_NODE_VERSION..."

  NVM_NODEJS_ORG_MIRROR="https://nodejs.org/download/rc"
  export NVM_NODEJS_ORG_MIRROR

  if ! nvm install "$PRERELEASE_NODE_VERSION"; then
    echo "RC installation failed. Trying Nightly mirror..."
    NVM_NODEJS_ORG_MIRROR="https://nodejs.org/download/nightly"
    export NVM_NODEJS_ORG_MIRROR

    if ! nvm install "$PRERELEASE_NODE_VERSION"; then
      echo "Installation failed with both RC and Nightly mirrors."
      echo "Trying to install configured version $CONFIGURED_PRERELEASE_NODE_VERSION..."
      install_node_version "$CONFIGURED_PRERELEASE_NODE_VERSION"
      exit 1
    fi
  fi

  echo "Node.js prerelease version $PRERELEASE_NODE_VERSION installed successfully."
}

install_node_version "$PRERELEASE_NODE_VERSION"
