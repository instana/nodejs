/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const nativeModuleRetry = require('./nativeModuleRetry');
module.exports = {
  nativeModuleRetry,
  /**
   * @param {import('@instana/core/src/logger').GenericLogger} logger
   */
  setLogger: function setLogger(logger) {
    nativeModuleRetry.setLogger(logger);
  }
};
