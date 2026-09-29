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
 * @param {any} libuv - The `libuv` sub-object from the metrics payload
 * @returns {number | undefined}
 */
function computeMean(libuv) {
  if (!libuv || typeof libuv.sum !== 'number' || typeof libuv.num !== 'number' || libuv.num === 0) {
    return undefined;
  }
  return msToSeconds(libuv.sum / libuv.num);
}

/**
 * @param {Record<string, any>} payload
 * @param {string} path
 * @returns {any}
 */
function resolvePath(payload, path) {
  return path.split('.').reduce((obj, key) => (obj != null ? obj[key] : undefined), payload);
}

module.exports = {
  msToSeconds,
  computeMean,
  resolvePath
};
