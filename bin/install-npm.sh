#!/bin/bash

npmVersion=$(cat .npm)

echo "Installing NPM version $npmVersion"
if npm install -g "npm@$npmVersion" --loglevel error 2>/dev/null; then
  hash -r
  echo "Using npm: $(npm --version)"
else
  echo "npm@$npmVersion is not supported by Node $(node --version), using bundled npm $(npm --version)"
fi
