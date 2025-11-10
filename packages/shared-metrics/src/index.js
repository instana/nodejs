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
const disable = require('./util/disable');

/** @type {Array.<import('@instana/core/src/metrics').InstanaMetricsModule>} */
const metricModules = [
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
 * @param {import('@instana/core/src/config').InstanaConfig} config
 */
const init = function (config) {
  util.init(config);
  disable.init(config);

  if (disable.areMetricsDisabled()) {
    return;
  }

  dependencies.init(config);
  description.init(config);
  directDependencies.init(config);
  healthchecks.init(config);
  keywords.init(config);
  name.init(config);
  version.init(config);
  gc.init();
  libuv.init();
};

/**
 * @typedef {Object} InstanaSharedMetrics
 * @property {Array.<import('@instana/core/src/metrics').InstanaMetricsModule>} allMetrics
 * @property {import('./util')} util
 * @property {(config: import('@instana/core/src/config').InstanaConfig) => void} init
 * @property {(logger: import('@instana/core/src/core').GenericLogger) => void} setLogger
 */

/** @type {InstanaSharedMetrics} */
const exported = {
  util,
  init,
  setLogger: () => {},
  get allMetrics() {
    // filtered dynamically if metrics are disabled
    return disable.areMetricsDisabled() ? [] : metricModules;
  }
};

module.exports = exported;
