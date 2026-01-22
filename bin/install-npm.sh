#!/bin/bash

# Read from root package.json engines.npm
npmVersion=$(jq -r '.engines.npm' package.json)

if [ -z "$npmVersion" ]; then
  echo "NPM version is not set in package.json"
  exit 1
fi

echo "Installing NPM version $npmVersion"
npm install -g npm@$npmVersion

echo "NPM version $npmVersion installed successfully"
