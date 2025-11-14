/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const { isNodeJsTooOld, minimumNodeJsVersion } = require('@instana/core/src/util/nodeJsVersionCheck');
const { hasEsmLoaderFile, hasExperimentalLoaderFlag } = require('@instana/core/src/util/esm');
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

// v18.19 and above usage of --experimental-loader flag no longer supported
// TODO: Remove error log in the next major release(v6)
if (hasExperimentalLoaderFlag()) {
  // eslint-disable-next-line no-console
  console.error(
    'Node.js introduced breaking changes in versions 18.19.0 and above, leading to the discontinuation of support ' +
      `for the --experimental-loader flag by Instana. The current Node.js version is ${process.version} and` +
      'this process will not be monitored by Instana. ' +
      "To ensure tracing by Instana, please use the '--import' flag instead. For more information, " +
      'refer to the Instana documentation: ' +
      'https://www.ibm.com/docs/en/instana-observability/current?topic=nodejs-collector-installation.'
  );
  module.exports.default = function noOp() {};
  // @ts-ignore TS1108
  return;
}

//  This loader worked with '--experimental-loader' in Node.js versions below 18.19.
//  TODO: Remove 'esm-loader.mjs' file and this log in the next major release (v6).
if (hasEsmLoaderFile()) {
  // eslint-disable-next-line no-console
  console.error(
    "Detected use of 'esm-loader.mjs'. This file is no longer supported and will be removed in next major release. " +
      'This process will not be monitored by Instana. ' +
      "To ensure tracing by Instana, please use the 'esm-register.mjs' file instead. For more information, " +
      'refer to the Instana documentation: ' +
      'https://www.ibm.com/docs/en/instana-observability/current?topic=nodejs-collector-installation.'
  );
  module.exports.default = function noOp() {};
  // @ts-ignore TS1108
  return;
}
let isMainThread = true;
try {
  isMainThread = require('worker_threads').isMainThread;
} catch (err) {
  // Worker threads are not available, so we know that this is the main thread.
}

// Check if worker threads should be disabled via environment variable.
// Disabling worker threads may be necessary in environments where
// multi-threading causes issues or monitoring of worker threads is not required.
const disableWorkerThreads = process.env.INSTANA_DISABLE_WORKER_THREADS?.toLowerCase() === 'true';

if (disableWorkerThreads && !isMainThread) {
  // eslint-disable-next-line no-console
  console.warn(
    'Worker threads are disabled via INSTANA_DISABLE_WORKER_THREADS. ' +
      'This worker thread will not be monitored by Instana.'
  );

  module.exports = function noOp() {};
  module.exports.default = function noOp() {};

  // @ts-ignore
  return;
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
      process?.send?.('instana.collector.initialized');

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

  log.setDownstreamConnection(agentConnection);

  pidStore.init(config);
  agentOpts.init(config);
  agentConnection.init(config, pidStore);

  announceCycle.init(config, pidStore);
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
