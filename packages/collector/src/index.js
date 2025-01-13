/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const { isNodeJsTooOld, minimumNodeJsVersion } = require('@instana/core/src/util/nodeJsVersionCheck');
const { isProcessAvailable } = require('@instana/core/src/util/moduleAvailable');

if (!isProcessAvailable()) {
  // eslint-disable-next-line no-console
  console.error('The Node.js core module process is not available. This process will not be monitored by Instana.');
  module.exports = function noOp() {};

  // ESM default exports for TS
  module.exports.default = function noOp() {};

  // @ts-ignore TS1108 (return can only be used within a function body)
  return;
}

if (isNodeJsTooOld()) {
  // eslint-disable-next-line no-console
  console.error(
    `The package @instana/collector requires at least Node.js ${minimumNodeJsVersion} but this process is ` +
      `running on Node.js ${process.version}. This process will not be monitored by Instana.`
  );

  // ESM default exports for TS
  module.exports.default = function noOp() {};

  // @ts-ignore TS1108 (return can only be used within a function body)
  return;
}

let isMainThread = true;
try {
  isMainThread = require('worker_threads').isMainThread;
} catch (err) {
  // Worker threads are not available, so we know that this is the main thread.
}

const path = require('path');
const instanaNodeJsCore = require('@instana/core');
const instanaSharedMetrics = require('@instana/shared-metrics');

require('./tracing'); // load additional instrumentations
const log = require('./logger');

const normalizeConfig = require('./util/normalizeConfig');
const experimental = require('./experimental');

/** @type {import('./agentConnection')} */
let agentConnection;

/** @type {import('./types/collector').CollectorConfig} */
let config;

/**
 * @param {import('./types/collector').CollectorConfig} [_config]
 */
function init(_config) {
  // @ts-ignore: Property '__INSTANA_INITIALIZED' does not exist on type global
  if (global.__INSTANA_INITIALIZED) {
    // Prevent initializing @instana/collector multiple times for the same process: @instana/collector has already been
    // initialized, potentially from a different installation of @instana/collector somewhere else in the file system.
    // Find that module in the require cache and return its exports (this is necessary to make sure calls to our API
    // work as expected).
    let collectorIndexCacheKey = Object.keys(require.cache).find(
      cacheKey => cacheKey.indexOf('/@instana/collector/src/index.js') >= 0
    );

    // Requiring the collector package twice in the test package using a relative path such as `../../..`
    if (process.env.NODE_ENV === 'test') {
      collectorIndexCacheKey = Object.keys(require.cache).find(
        cacheKey => cacheKey.indexOf('collector/src/index.js') >= 0
      );
    }

    if (collectorIndexCacheKey) {
      // eslint-disable-next-line no-unused-expressions
      process.send && process.send('instana.collector.initialized');

      return require.cache[collectorIndexCacheKey].exports;
    } else {
      // eslint-disable-next-line no-console
      console.error(
        "Warning: Instana has already been initialized but the module @instana/collector is not present in Node.js' " +
          'module cache. The Instana API will not be available.'
      );
      return init;
    }
  }
  // @ts-ignore: Property '__INSTANA_INITIALIZED' does not exist on type global
  global.__INSTANA_INITIALIZED = true;
  config = normalizeConfig(_config);

  agentConnection = require('./agentConnection');
  const agentOpts = require('./agent/opts');
  const pidStore = require('./pidStore');
  const uncaught = require('./uncaught');

  let logger;
  logger = log.getLogger('index', newLogger => {
    logger = newLogger;
  });

  // NOTE: By default we set our instana internal bunyan logger
  config.logger = logger;

  agentOpts.init(config);
  instanaNodeJsCore.init(config, agentConnection, pidStore);
  instanaSharedMetrics.setLogger(logger);

  if (isMainThread) {
    uncaught.init(config, agentConnection, pidStore);
    require('./metrics').init(config);
  }

  logger.info('@instana/collector module version: %s', require(path.join(__dirname, '..', 'package.json')).version);
  require('./announceCycle').start();

  return init;
}

init.currentSpan = function getHandleForCurrentSpan() {
  return instanaNodeJsCore.tracing.getHandleForCurrentSpan();
};

init.isTracing = function isTracing() {
  return instanaNodeJsCore.tracing.getCls() ? instanaNodeJsCore.tracing.getCls().isTracing() : false;
};

init.isConnected = function isConnected() {
  return agentConnection && agentConnection.isConnected();
};

/**
 * @param {import('@instana/core/src/core').GenericLogger} logger
 */
init.setLogger = function setLogger(logger) {
  // NOTE: Override our default logger with customer's logger
  config.logger = logger;
  log.init(config, true);
};

init.core = instanaNodeJsCore;
init.sharedMetrics = instanaSharedMetrics;
init.experimental = experimental;
init.opentracing = instanaNodeJsCore.tracing.opentracing;
init.sdk = instanaNodeJsCore.tracing.sdk;

if (process.env.INSTANA_IMMEDIATE_INIT != null && process.env.INSTANA_IMMEDIATE_INIT.toLowerCase() === 'true') {
  init();
} else if (
  process.env.INSTANA_EARLY_INSTRUMENTATION != null &&
  process.env.INSTANA_EARLY_INSTRUMENTATION.toLowerCase() === 'true'
) {
  instanaNodeJsCore.preInit();
}

module.exports = init;
module.exports.default = init;
