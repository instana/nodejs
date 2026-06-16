/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const ctx = require('../context');

/**
 * @param {Object|null} sourceMetadata
 * @param {Object} [options]
 * @returns {number|undefined}
 */
function computeProcessId(sourceMetadata, options = {}) {
  const pid = sourceMetadata?.e || options.fallbackPid || ctx.pid;

  const value = Number(pid);

  return Number.isInteger(value) && value > 0 ? value : undefined;
}

/**
 * @param {Object|null} sourceMetadata
 * @returns {string|undefined}
 */
function computeHostName(sourceMetadata) {
  return sourceMetadata?.h || ctx.hostId;
}

module.exports = {
  computeProcessId,
  computeHostName
};
