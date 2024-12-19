/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const logger = require('pino');

function createCustomLogger() {
  const customPino = Object.assign(function (...args) {
    return logger(...args);
  }, logger);

  return customPino;
}

module.exports = createCustomLogger();
