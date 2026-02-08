/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
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

if (process.env.SKIP_TGZ !== 'true') {
  const testDir = __dirname;
  const preinstallScript = path.join(testDir, 'preinstall.sh');

  if (fs.existsSync(preinstallScript)) {
    const tgzChecksumPath = path.join(testDir, '.tgz-checksum');
    const srcDirs = ['collector', 'core', 'shared-metrics'].map(p => path.join(rootDir, 'packages', p, 'src'));
    const tgzHash = hashDirectories(srcDirs);

    let needsTgzRegen = true;
    try {
      needsTgzRegen = fs.readFileSync(tgzChecksumPath, 'utf8').trim() !== tgzHash;
    } catch (_) {
      // first run
    }

    if (needsTgzRegen) {
      // eslint-disable-next-line no-console
      console.log('Source changed — regenerating tgz packages...');
      execSync(`bash "${preinstallScript}"`, { cwd: testDir, stdio: 'inherit' });
      fs.writeFileSync(tgzChecksumPath, tgzHash);
    } else {
      // eslint-disable-next-line no-console
      console.log('tgz packages up to date, skipping generation.');
    }
  }
}

function hashDirectories(dirs) {
  const h = crypto.createHash('md5');
  for (const dir of dirs) {
    hashDir(dir, h);
  }
  return h.digest('hex');
}

function hashDir(dir, h) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      hashDir(full, h);
    } else {
      h.update(fs.readFileSync(full));
    }
  }
}

