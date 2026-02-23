#!/usr/bin/env node
/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const rootDir = path.resolve(__dirname, '..');
const currenciesPath = path.join(rootDir, 'currencies.json');
const collectorTestDir = path.join(rootDir, 'packages', 'collector', 'test');
const checksumPath = path.join(collectorTestDir, '.currencies-checksum');

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function hashTemplates(dir, h) {
  fs.readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.name !== 'node_modules' && !entry.name.startsWith('_v'))
    .forEach(entry => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        hashTemplates(full, h);
      } else if (entry.name === 'package.json.template' || entry.name === 'modes.json') {
        h.update(fs.readFileSync(full, 'utf8'));
      } else if (entry.name === 'test_base.js') {
        h.update(full);
      }
    });
}

function calculateChecksum() {
  const hash = crypto.createHash('md5');
  hash.update(fs.readFileSync(currenciesPath, 'utf8'));
  hashTemplates(collectorTestDir, hash);
  return hash.digest('hex');
}

function main() {
  const currentHash = calculateChecksum();
  let needsRegen = true;

  try {
    needsRegen = fs.readFileSync(checksumPath, 'utf8').trim() !== currentHash;
  } catch (_) {
    // first run or checksum file missing
  }

  if (needsRegen) {
    log('[INFO] Test folders out of date — regenerating...');
    execSync('node bin/create-version-test-folders.js', { cwd: rootDir, stdio: 'inherit' });
    fs.writeFileSync(checksumPath, currentHash);
  } else {
    log('[INFO] Test folders up to date, skipping generation.');
  }
}

main();
