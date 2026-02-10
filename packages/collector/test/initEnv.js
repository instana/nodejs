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

if (!isCI()) {
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
    // eslint-disable-next-line no-console
    console.log('[INFO] Test folders out of date — regenerating...');
    execSync('node bin/create-version-test-folders.js', { cwd: rootDir, stdio: 'inherit' });
    fs.writeFileSync(checksumPath, currentHash);
  }
}

if (process.env.SKIP_TGZ !== 'true') {
  const testDir = __dirname;
  const preinstallScript = path.join(testDir, 'preinstall.sh');

  if (fs.existsSync(preinstallScript)) {
    const tgzChecksumPath = path.join(testDir, '.tgz-checksum');
    const tgzLockPath = path.join(testDir, '.tgz-lock');
    const preinstalledArchive = path.join(testDir, 'preinstalled-node-modules', 'node_modules.tar.gz');
    const srcDirs = ['collector', 'core', 'shared-metrics'].map(p => path.join(rootDir, 'packages', p, 'src'));
    const tgzHash = hashDirectories(srcDirs);

    let needsTgzRegen = true;
    try {
      needsTgzRegen = fs.readFileSync(tgzChecksumPath, 'utf8').trim() !== tgzHash || !fs.existsSync(preinstalledArchive);
    } catch (_) {
      // first run
    }

    if (needsTgzRegen) {
      const regenerate = () => {
        // eslint-disable-next-line no-console
        console.log('[INFO] Source changed — regenerating tgz packages and preinstalled node_modules...');
        execSync(`bash "${preinstallScript}"`, { cwd: testDir, stdio: 'inherit' });
        fs.writeFileSync(tgzChecksumPath, tgzHash);
      };

      if (isCI()) {
        const isStillNeeded = () => {
          try {
            return fs.readFileSync(tgzChecksumPath, 'utf8').trim() !== tgzHash || !fs.existsSync(preinstalledArchive);
          } catch (_) {
            return true;
          }
        };

        acquireLock(tgzLockPath, regenerate, isStillNeeded);
      } else {
        regenerate();
      }
    } else {
      // eslint-disable-next-line no-console
      console.log('[INFO] tgz packages and preinstalled node_modules up to date, skipping generation.');
    }
  }
}

function hashDirectories(dirs) {
  const h = crypto.createHash('md5');
  dirs.forEach(dir => hashDir(dir, h));
  return h.digest('hex');
}

function hashDir(dir, h) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      hashDir(full, h);
    } else {
      h.update(fs.readFileSync(full));
    }
  });
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

/**
 * Acquires a file-based lock for exclusive access.
 * If lock is held by another process, waits until it's released.
 *
 * @param {string} lockPath - Path to the lock file
 * @param {Function} callback - Function to execute while holding the lock
 * @param {Function} [isStillNeeded] - If provided, checked after waiting. Skips lock acquisition if returns false.
 */
function acquireLock(lockPath, callback, isStillNeeded) {
  const maxWaitTime = 10 * 60 * 1000;
  const checkInterval = 1000 * 5;
  const startTime = Date.now();
  const lockTimeout = 15 * 60 * 1000;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (Date.now() - startTime > maxWaitTime) {
      throw new Error(`Timeout waiting for lock at ${lockPath}`);
    }

    if (fs.existsSync(lockPath)) {
      try {
        const lockData = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
        const lockAge = Date.now() - lockData.timestamp;

        if (lockAge > lockTimeout) {
          // eslint-disable-next-line no-console
          console.log('[WARN] Removing stale lock file');
          try { fs.unlinkSync(lockPath); } catch (_) { /* already removed */ }
          continue;
        }
      } catch (err) {
        if (err instanceof SyntaxError) {
          try { fs.unlinkSync(lockPath); } catch (_) { /* already removed */ }
          continue;
        }
        throw err;
      }

      // eslint-disable-next-line no-console
      console.log('[INFO] Waiting for another process to finish generation...');
      execSync(`sleep ${checkInterval / 1000}`);
      continue;
    }

    // After waiting, check if work is still needed before acquiring
    if (isStillNeeded && !isStillNeeded()) {
      // eslint-disable-next-line no-console
      console.log('[INFO] Another process already completed the generation.');
      return;
    }

    // Try to acquire lock
    try {
      fs.writeFileSync(lockPath, JSON.stringify({ timestamp: Date.now(), pid: process.pid }), { flag: 'wx' });
      // eslint-disable-next-line no-console
      console.log('[INFO] Lock acquired, starting generation...');
    } catch (_) {
      // Another process acquired it first, retry
      continue;
    }

    try {
      callback();
    } finally {
      try {
        fs.unlinkSync(lockPath);
        // eslint-disable-next-line no-console
        console.log('[INFO] Lock released.');
      } catch (_) { /* already removed */ }
    }

    return;
  }
}
