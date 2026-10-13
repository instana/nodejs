#!/bin/bash

# Installs the npm version specified in `.npm`, falling back to lower major versions on `EBADENGINE`.
# If all attempts fail, keeps the npm version bundled with Node.js.

npmVersion=$(cat .npm)
targetMajor="${npmVersion%%.*}"
echo "Installing NPM version $npmVersion"

if npm install -g "npm@$npmVersion" --loglevel error; then
  hash -r
  echo "Using npm: $(npm --version)"
  exit 0
fi

for ((major = targetMajor - 1; major >= 10; major--)); do
  echo "npm@$npmVersion is not supported by Node $(node --version), trying npm@$major"
  if npm install -g "npm@$major" --loglevel error; then
    hash -r
    echo "Using npm: $(npm --version)"
    exit 0
  fi
done

echo "Could not install a newer npm, keeping bundled npm $(npm --version)"
exit 0
