/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const nativeModuleRetry = require('./nativeModuleRetry');
const dependencyDistanceCalculator = require('./DependencyDistanceCalculator');

/**
 * @param {import('@instana/core/src/config').InstanaConfig} config
 */
const init = config => {
  nativeModuleRetry.init(config);
  dependencyDistanceCalculator.init(config);
};

module.exports = {
  init,
  nativeModuleRetry,
  dependencyDistanceCalculator
};
