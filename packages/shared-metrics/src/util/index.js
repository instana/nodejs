/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2020
 */

'use strict';

module.exports = exports = {
  nativeModuleRetry: require('./nativeModuleRetry'),
  setLogger: function setLogger(logger) {
    exports.nativeModuleRetry.setLogger(logger);
  }
};
