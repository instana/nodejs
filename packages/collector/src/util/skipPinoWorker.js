/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

/**
 * Detects whether the current process is a Pino thread-stream worker thread.
 * Returns true if we should skip instrumentation for this worker.
 */
function skipPinoWorker() {
  try {
    const { isMainThread, workerData } = require('worker_threads');
    if (isMainThread) return false;

    // Check workerData properties for pino thread-stream
    if (workerData && typeof workerData === 'object') {
      const dataString = Object.values(workerData).join(' ').toLowerCase();
      if (dataString.includes('thread-stream')) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

module.exports = skipPinoWorker;
