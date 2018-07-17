#!/usr/bin/env bash

ESLINT_UNSUPPORTED_VERSION=$(node -e "console.log(process.version.indexOf('v0') === 0)")

if [ $ESLINT_UNSUPPORTED_VERSION != true ]; then
  npm run test:eslint
else
  echo "Eslint is not supported on Node.js version < 4.x, skipping linting."
fi

