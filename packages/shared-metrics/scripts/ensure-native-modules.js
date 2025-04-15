/*
 * (c) Copyright IBM Corp. 2025
 */

/* eslint-disable no-console */

'use strict';

const { execSync } = require('child_process');
const version = process.version;
const isPrerelease = /-(rc|nightly)/.test(version);

if (isPrerelease) {
  console.log(`Skipping native module install for prerelease Node.js version: ${version}`);
  process.exit(0);
}

/**
 * @param {string} pkg
 */
function isInstalled(pkg) {
  try {
    require.resolve(pkg);
    return true;
  } catch {
    return false;
  }
}

const nativeModules = ['event-loop-stats', 'gcstats.js'];

nativeModules.forEach(mod => {
  if (!isInstalled(mod)) {
    console.log(`Installing missing module (no lockfile update): ${mod}`);
    execSync(`npm install ${mod} --no-save`, { stdio: 'inherit' });
  } else {
    console.log(`Already present: ${mod}`);
  }
});
