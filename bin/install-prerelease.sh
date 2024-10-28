#!/bin/bash

fetch_latest_prerelease_node_version() {
  local latest_version
  
  latest_version=$(curl -sL https://nodejs.org/dist/index.json | grep -m 1 '"version"' | grep -o 'v[0-9]*\.[0-9]*\.[0-9]*')
  latest_version=${latest_version#v}
  IFS='.' read -r major minor patch <<< "$latest_version"
  major=$((major + 1))
  echo "${major}"
}

PRERELEASE_NODE_VERSION=$(fetch_latest_prerelease_node_version)

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
  if ! nvm install "$PRERELEASE_NODE_VERSION" &> /dev/null; then
    echo "RC installation failed. Trying Nightly mirror..."
    NVM_NODEJS_ORG_MIRROR="https://nodejs.org/download/nightly"
    if ! nvm install "$PRERELEASE_NODE_VERSION" &> /dev/null; then
      echo "Installation failed with both RC and Nightly mirrors."
    exit 1
    fi
  fi

  nvm use "$PRERELEASE_NODE_VERSION" > /dev/null 
  echo "Node.js prerelease version $PRERELEASE_NODE_VERSION installed successfully."
}

install_node_version "$PRERELEASE_NODE_VERSION"
