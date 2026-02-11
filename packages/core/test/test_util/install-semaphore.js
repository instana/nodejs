/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Semaphore dir in the workspace root (shared across CI containers via PVC)
const rootDir = path.resolve(__dirname, '..', '..', '..', '..');
const SEMAPHORE_DIR = path.join(rootDir, '.npm-install-semaphore');
const MAX_CONCURRENT = parseInt(process.env.NPM_INSTALL_CONCURRENCY, 10) || 5;
const MAX_WAIT = 10 * 60 * 1000;
const STALE_TIMEOUT = 10 * 60 * 1000;

function tryUnlink(file) {
  try { fs.unlinkSync(file); } catch (e) { /* already removed */ }
}

/**
 * File-based semaphore to limit concurrent npm installs across CI containers.
 * Each slot is a lock file created with the exclusive flag (wx).
 */
function acquireSlot(logFn) {
  fs.mkdirSync(SEMAPHORE_DIR, { recursive: true });
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    function tryAcquire() {
      if (Date.now() - startTime > MAX_WAIT) {
        return reject(new Error(`Timeout waiting for npm install slot (${MAX_CONCURRENT} max concurrent)`));
      }

      for (let i = 0; i < MAX_CONCURRENT; i++) {
        const slotFile = path.join(SEMAPHORE_DIR, `slot-${i}`);
        try {
          fs.writeFileSync(slotFile, JSON.stringify({ pid: process.pid, ts: Date.now() }), { flag: 'wx' });
          return resolve(i);
        } catch (e1) {
          try {
            const data = JSON.parse(fs.readFileSync(slotFile, 'utf8'));
            if (Date.now() - data.ts > STALE_TIMEOUT) {
              tryUnlink(slotFile);
            }
          } catch (e2) {
            tryUnlink(slotFile);
          }
        }
      }

      if (logFn) logFn(`[INFO] Waiting for install slot (${MAX_CONCURRENT} concurrent max)...`);
      const waitMs = 2000 + Math.floor(Math.random() * 1000);
      setTimeout(tryAcquire, waitMs);
    }

    tryAcquire();
  });
}

function releaseSlot(slot) {
  tryUnlink(path.join(SEMAPHORE_DIR, `slot-${slot}`));
}

exports.acquireSlot = acquireSlot;
exports.releaseSlot = releaseSlot;
exports.MAX_CONCURRENT = MAX_CONCURRENT;
