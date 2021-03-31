/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

exports.allMetrics = [
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

exports.util = require('./util');

exports.setLogger = function (logger) {
  exports.util.setLogger(logger);
};
