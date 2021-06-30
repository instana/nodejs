/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const allMetrics = [
  require('./activeHandles'),
  require('./activeRequests'),
  require('./args'),
  require('./dependencies'),
  require('./directDependencies'),
  require('./description'),
  require('./directDependencies'),
  require('./execArgs'),
  require('./gc'),
  require('./healthchecks'),
  require('./heapSpaces'),
  require('./http'),
  require('./keywords'),
  require('./libuv'),
  require('./memory'),
  require('./name'),
  require('./version')
];

const util = require('./util');

/**
 * @param {import('@instana/core/src/logger').GenericLogger} logger
 */
const setLogger = function (logger) {
  util.setLogger(logger);
};

/**
 * @typedef {Object} InstanaSharedMetrics
 * @property {Array.<*>} allMetrics
 * @property {*} util
 * @property {*} setLogger
 */

/** @type {InstanaSharedMetrics} */
module.exports = {
  allMetrics,
  util,
  setLogger
};
