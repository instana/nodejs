/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

module.exports = exports = function log(prefix) {
  // eslint-disable-next-line func-names
  return function() {
    const args = Array.prototype.slice.call(arguments);
    args[0] = `[${prefix}]: ${args[0]}`;
    // eslint-disable-next-line no-console
    console.log.apply(console, args);
  };
};
