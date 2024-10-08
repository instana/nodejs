#!/bin/bash

NODE_VERSION=$1
PRERELEASE_NODE_VERSION=$2

echo "Installing node prerelease version $PRERELEASE_NODE_VERSION.."

if ! command -v nvm &> /dev/null; then
  echo "NVM not found. Installing NVM..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash

  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
else
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
fi

NVM_NODEJS_ORG_MIRROR="https://nodejs.org/download/rc" nvm install "$PRERELEASE_NODE_VERSION" 

if ! nvm ls "$PRERELEASE_NODE_VERSION" >/dev/null; then
  echo "RC installation failed for Node.js version $PRERELEASE_NODE_VERSION."

  NVM_NODEJS_ORG_MIRROR="https://nodejs.org/download/nightly" nvm install "$PRERELEASE_NODE_VERSION" || \
  echo "Installation failed with NIGHTLY mirror"
fi

nvm use "$PRERELEASE_NODE_VERSION"

echo "Currently using node: $(node --version)"
