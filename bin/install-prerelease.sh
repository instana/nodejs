#!/bin/bash

PRERELEASE_NODE_VERSION=$1

echo "Installing node.js prerelease version $PRERELEASE_NODE_VERSION.."

if ! command -v nvm &> /dev/null 2>&1; then
  mirrors=("https://nodejs.org/download/rc" "https://nodejs.org/download/nightly")
  echo "NVM not found. Installing NVM..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh > /dev/null 2>&1| bash > /dev/null 2>&1
  # Load NVM
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" > /dev/null 2>&1
else
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" > /dev/null 2>&1
fi

for mirror in "${mirrors[@]}"; do
  NVM_NODEJS_ORG_MIRROR="$mirror" nvm install "$PRERELEASE_NODE_VERSION" > /dev/null 2>&1 && break || \
  echo "Installation failed with mirror: $mirror"
done

if ! nvm ls "$PRERELEASE_NODE_VERSION" > /dev/null 2>&1; then
  echo "Both RC and Nightly installations failed for Node.js version $PRERELEASE_NODE_VERSION."
fi

nvm use "$PRERELEASE_NODE_VERSION" > /dev/null 2>&1

