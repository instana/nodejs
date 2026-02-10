/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const testDir = path.join(__dirname, '..');
const preinstalledArchive = path.join(testDir, 'preinstalled-node-modules', 'node_modules.tar.gz');

/**
 * Extracts preinstalled Instana packages from archive.
 *
 * @param {string} targetDir - The directory where node_modules should be extracted
 * @param {object} options - Optional configuration
 * @param {number} options.timeout - Timeout for extraction (ms)
 */
function extractPreinstalledPackages(targetDir, options = {}) {
  const timeout = options.timeout || 30000;

  if (!fs.existsSync(preinstalledArchive)) {
    console.log('[INFO] Preinstalled packages archive not found');
    return false;
  }

  try {
    console.log('[INFO] Extracting preinstalled Instana packages...');
    execSync(`tar -xzf "${preinstalledArchive}"`, {
      cwd: targetDir,
      stdio: 'inherit',
      timeout
    });
    console.log('[INFO] Successfully extracted preinstalled Instana packages');
    return true;
  } catch (err) {
    console.warn('[WARN] Failed to extract preinstalled packages');
    console.warn(err.message);
    return false;
  }
}

module.exports = {
  extractPreinstalledPackages
};
