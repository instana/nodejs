/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const isCI = require('@_local/core/test/test_util/is_ci');

const rootDir = path.join(__dirname, '..', '..', '..');

// NOTE: default docker compose hosts, ports and credentials
const configPath = path.join(rootDir, 'hosts_config.json');
const hostsConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

Object.keys(hostsConfig).forEach(key => {
  if (!process.env[key]) {
    process.env[key] = hostsConfig[key];
  }
});

if (isCI()) {
  return;
}

const checksumPath = path.join(__dirname, '.currencies-checksum');

const hash = crypto.createHash('md5');
hash.update(fs.readFileSync(path.join(rootDir, 'currencies.json'), 'utf8'));
hashTemplates(__dirname, hash);
const currentHash = hash.digest('hex');

let needsRegen = true;
try {
  needsRegen = fs.readFileSync(checksumPath, 'utf8').trim() !== currentHash;
} catch (_) {
  // checksum file doesn't exist yet → first run
}

if (needsRegen) {
  const { execSync } = require('child_process');
  // eslint-disable-next-line no-console
  console.log('Test folders out of date — regenerating...');
  execSync('node bin/create-version-test-folders.js', { cwd: rootDir, stdio: 'inherit' });
  fs.writeFileSync(checksumPath, currentHash);
}

function hashTemplates(dir, h) {
  fs.readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.name !== 'node_modules' && !entry.name.startsWith('_v'))
    .forEach(entry => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) hashTemplates(full, h);
      else if (entry.name === 'package.json.template' || entry.name === 'modes.json') h.update(fs.readFileSync(full, 'utf8'));
      else if (entry.name === 'test_base.js') h.update(full);
    });
}
