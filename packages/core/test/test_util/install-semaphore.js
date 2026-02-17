/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const rootDir = path.resolve(__dirname, '..', '..', '..', '..');
const SEMAPHORE_DIR = path.join(rootDir, '.npm-install-semaphore');

const MAX_CONCURRENT = 4;
const MAX_WAIT = 10 * 60 * 1000;
const STALE_TIMEOUT = 5 * 60 * 1000;
const LOG_INTERVAL = 10000;

function tryUnlink(file) {
  try {
    fs.unlinkSync(file);
  } catch (e) {
    /* already removed or not found */
  }
}

function acquireSlot(logFn) {
  try {
    fs.mkdirSync(SEMAPHORE_DIR, { recursive: true });
  } catch (e) {
    console.error(`[ERROR] Failed to create semaphore directory: ${SEMAPHORE_DIR}`, e);
  }

  const startTime = Date.now();
  const myHost = os.hostname();

  let mySlot = -1;
  let lastLogTime = 0;

  const cleanup = () => {
    if (mySlot !== -1) {
      if (logFn) logFn(`[INFO] Process exiting, releasing slot ${mySlot}...`);
      releaseSlot(mySlot);
      mySlot = -1;
    }
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  // Optional: process.on('exit', cleanup);

  return new Promise((resolve, reject) => {
    function tryAcquire() {
      const now = Date.now();

      if (now - startTime > MAX_WAIT) {
        return reject(new Error(`Timeout waiting for npm install slot (${MAX_CONCURRENT} max concurrent)`));
      }

      for (let i = 0; i < MAX_CONCURRENT; i++) {
        const slotFile = path.join(SEMAPHORE_DIR, `slot-${i}`);

        const lockData = {
          pid: process.pid,
          host: myHost,
          ts: now
        };

        try {
          fs.writeFileSync(slotFile, JSON.stringify(lockData), { flag: 'wx' });
          mySlot = i;
          return resolve(i);
        } catch (e1) {
          try {
            const content = fs.readFileSync(slotFile, 'utf8');
            const data = JSON.parse(content);

            if (now - data.ts > STALE_TIMEOUT) {
              if (logFn) {
                logFn(
                  `[WARN] Found stale lock in slot ${i} (Age: ${Math.round((now - data.ts) / 1000)}s) from host '${
                    data.host
                  }'. Removing it.`
                );
              }
              tryUnlink(slotFile);
            }
          } catch (e2) {
            tryUnlink(slotFile);
          }
        }
      }

      if (logFn && now - lastLogTime > LOG_INTERVAL) {
        lastLogTime = now;

        let lockedCount = 0;
        const holderDetails = [];

        for (let i = 0; i < MAX_CONCURRENT; i++) {
          const f = path.join(SEMAPHORE_DIR, `slot-${i}`);
          if (fs.existsSync(f)) {
            lockedCount++;
            try {
              const d = JSON.parse(fs.readFileSync(f, 'utf8'));
              const age = Math.round((now - d.ts) / 1000);
              // Format: "#0 (pod-xyz): 45s"
              holderDetails.push(`#${i} (${d.host || 'unknown'}): ${age}s`);
            } catch (e) {
              holderDetails.push(`#${i}: ???`);
            }
          }
        }

        logFn(
          `[INFO] Waiting for slot. Locked: ${lockedCount}/${MAX_CONCURRENT}. Holders: [${holderDetails.join(', ')}]`
        );
      }

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
