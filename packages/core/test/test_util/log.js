/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

/**
 * Returns a log function
 * @param {string} logPrefix
 * @returns {(...args: *) => void}
 */
exports.getLogger = function (logPrefix) {
  return function log() {
    /* eslint-disable no-console */
    const args = Array.prototype.slice.call(arguments);
    args[0] = `${logPrefix}${args[0]}`;
    console.log.apply(console, args);
    /* eslint-enable no-console */
  };
};
