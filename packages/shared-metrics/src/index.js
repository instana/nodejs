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

const setLogger = function (logger) {
  util.setLogger(logger);
};

/**
 * @typedef {Object} InstanaSharedMetrics
 * @property {*} allMetrics
 * @property {*} util
 * @property {*} setLogger
 */

module.exports = {
  allMetrics,
  util,
  setLogger
};
