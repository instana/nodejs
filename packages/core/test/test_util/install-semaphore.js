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

/**
 * File-based semaphore to limit concurrent npm installs across CI containers.
 * Each slot is a lock file created with the exclusive flag (wx).
 */
async function acquireSlot(logFn) {
  fs.mkdirSync(SEMAPHORE_DIR, { recursive: true });
  const startTime = Date.now();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (Date.now() - startTime > MAX_WAIT) {
      throw new Error(`Timeout waiting for npm install slot (${MAX_CONCURRENT} max concurrent)`);
    }

    for (let i = 0; i < MAX_CONCURRENT; i++) {
      const slotFile = path.join(SEMAPHORE_DIR, `slot-${i}`);
      try {
        fs.writeFileSync(slotFile, JSON.stringify({ pid: process.pid, ts: Date.now() }), { flag: 'wx' });
        return i;
      } catch (_) {
        try {
          const data = JSON.parse(fs.readFileSync(slotFile, 'utf8'));
          if (Date.now() - data.ts > STALE_TIMEOUT) {
            try { fs.unlinkSync(slotFile); } catch (_) { /* already removed */ }
          }
        } catch (_) {
          try { fs.unlinkSync(slotFile); } catch (_) { /* already removed */ }
        }
      }
    }

    if (logFn) logFn(`[INFO] Waiting for install slot (${MAX_CONCURRENT} concurrent max)...`);
    const waitMs = 2000 + Math.floor(Math.random() * 1000);
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }
}

function releaseSlot(slot) {
  try {
    fs.unlinkSync(path.join(SEMAPHORE_DIR, `slot-${slot}`));
  } catch (_) { /* already removed */ }
}

exports.acquireSlot = acquireSlot;
exports.releaseSlot = releaseSlot;
exports.MAX_CONCURRENT = MAX_CONCURRENT;
