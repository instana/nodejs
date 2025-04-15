/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';
const { execSync } = require('child_process');

const version = process.version;

// NOTE: skip native build step if using a pre-release (e.g., RC or nightly) version of Node.js
if (/-(rc|nightly)/.test(version)) {
  // eslint-disable-next-line no-console
  console.log(`Skipping native build for pre-release Node.js version: ${version}`);
  process.exit(0);
}

// eslint-disable-next-line no-console
console.log(`Running node-gyp-build for Node.js version: ${version}`);
execSync('npm run build:native', { stdio: 'inherit' });
