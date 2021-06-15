/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

/**
 * @param {...*} args
 * @returns {Array.<*>}
 */
exports.getFunctionArguments = function getFunctionArguments(args) {
  const originalArgs = new Array(args.length);
  for (let i = 0; i < originalArgs.length; i++) {
    originalArgs[i] = args[i];
  }
  return originalArgs;
};
