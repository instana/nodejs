#!/bin/bash

PRERELEASE_NODE_VERSION=$1

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
