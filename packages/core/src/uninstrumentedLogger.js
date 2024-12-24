/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

// eslint-disable-next-line import/no-extraneous-dependencies, instana/no-unsafe-require
const logger = require('pino');

function createCustomLogger() {
  const customPino = Object.assign(function (/** @type {any} */ ...args) {
    // @ts-ignore
    return logger(...args);
  }, logger);

  return customPino;
}

module.exports = createCustomLogger();
