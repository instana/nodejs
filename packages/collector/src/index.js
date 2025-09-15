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
const normalizeCollectorConfig = require('./util/normalizeConfig');
const experimental = require('./experimental');

// NOTE: Default collector logger && config for cases like `preinit`.
const logger = log.init();
instanaNodeJsCore.coreConfig.init(logger);

/** @type {import('./types/collector').CollectorConfig} */
let config = instanaNodeJsCore.coreConfig.normalize();
/** @type {import('./agentConnection')} */
let agentConnection;

/**
 * @param {import('./types/collector').CollectorConfig} [userConfig]
 */
function init(userConfig = {}) {
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

  // CASE: reinit logger if custom logger or log level is provided.
  if (userConfig.logger || userConfig.level) {
    log.init(userConfig);
  }

  config = normalizeCollectorConfig(userConfig);
  config = instanaNodeJsCore.coreConfig.normalize(config);

  agentConnection = require('./agentConnection');
  const agentOpts = require('./agent/opts');
  const pidStore = require('./pidStore');
  const uncaught = require('./uncaught');
  const announceCycle = require('./announceCycle');
  const metrics = require('./metrics');

  pidStore.init(config);
  agentOpts.init(config);
  announceCycle.init(config, pidStore);
  agentConnection.init(config, pidStore);
  instanaNodeJsCore.init(config, agentConnection, pidStore);

  if (isMainThread) {
    uncaught.init(config, agentConnection, pidStore);
    metrics.init(config, pidStore);
  }

  logger.info(`@instana/collector module version: ${require(path.join(__dirname, '..', 'package.json')).version}`);
  announceCycle.start();

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
 * Keep in mind:
 * Instana logs might appear in the internal log level for a very short time
 * if you set a custom logger with a different log level. That is because "setLogger"
 * is called after the initialization of the collector.
 *
 * const instana = require('@instana/collector')();
 * const pino = require('pino')
 * instana.setLogger(pinoLogger)
 *
 * Setting the **same** log level in the custom logger and the collector logger
 * will prevent this behavior.
 *
 * @param {import('@instana/core/src/core').GenericLogger} _logger
 */
init.setLogger = function setLogger(_logger) {
  // NOTE: Override our default logger with customer's logger
  log.init({ logger: _logger });
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
  instanaNodeJsCore.preInit(config);
}

module.exports = init;
module.exports.default = init;
