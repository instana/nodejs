/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 * @param {any} ms
 * @returns {number | undefined}
 */
function msToSeconds(ms) {
  if (typeof ms !== 'number') return undefined;
  return ms / 1000;
}

/**
 * @param {any} sum - The total sum value (ms)
 * @param {any} num - The sample count
 * @returns {number | undefined}
 */
function computeMean(sum, num) {
  if (typeof sum !== 'number' || typeof num !== 'number' || num === 0) {
    return undefined;
  }
  return msToSeconds(sum / num);
}

module.exports = {
  msToSeconds,
  computeMean
};
