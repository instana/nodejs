/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const activeHandles = require('./activeHandles');
const activeRequests = require('./activeRequests');
const args = require('./args');
const dependencies = require('./dependencies');
const directDependencies = require('./directDependencies');
const description = require('./description');
const execArgs = require('./execArgs');
const gc = require('./gc');
const healthchecks = require('./healthchecks');
const heapSpaces = require('./heapSpaces');
const http = require('./http');
const keywords = require('./keywords');
const libuv = require('./libuv');
const memory = require('./memory');
const name = require('./name');
const version = require('./version');
const util = require('./util');

/** @type {Array.<import('@instana/core/src/metrics').InstanaMetricsModule>} */
const allMetrics = [
  activeHandles,
  activeRequests,
  args,
  dependencies,
  directDependencies,
  description,
  execArgs,
  gc,
  healthchecks,
  heapSpaces,
  http,
  keywords,
  libuv,
  memory,
  name,
  version
];

/**
 * @param {import('@instana/core/src/config/normalizeConfig').InstanaConfig} config
 * @param {import('@instana/core/src/util').CoreUtilsType} utils
 */
const init = function (config, utils) {
  dependencies.init(config, utils);
  description.init(config, utils);
  directDependencies.init(config, utils);
  healthchecks.init(config);
  keywords.init(config, utils);
  name.init(config, utils);
  version.init(config, utils);
  gc.init();
  libuv.init();
};

/**
 * @typedef {Object} InstanaSharedMetrics
 * @property {Array.<import('@instana/core/src/metrics').InstanaMetricsModule>} allMetrics
 * @property {import('./util')} util
 * @property {(config: import('@instana/core/src/config/normalizeConfig').InstanaConfig) => void} init
 * @property {(logger: import('@instana/core/src/core').GenericLogger) => void} setLogger
 */

/** @type {InstanaSharedMetrics} */
module.exports = {
  allMetrics,
  util,
  init,
  // TODO: Remove in next major release
  setLogger: () => {}
};
