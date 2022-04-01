/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

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

/** @type {import('./util/normalizeConfig').CollectorConfig} */
let config;

/**
 * @param {import('./util/normalizeConfig').CollectorConfig} [_config]
 */
function init(_config) {
  // @ts-ignore: Property '__INSTANA_INITIALIZED' does not exist on type global
  if (global.__INSTANA_INITIALIZED) {
    // Prevent initializing @instana/collector multiple times for the same process: @instana/collector has already been
    // initialized, potentially from a different installation of @instana/collector somewhere else in the file system.
    // Find that module in the require cache and return its exports (this is necessary to make sure calls to our API
    // work as expected).
    const collectorIndexCacheKey = Object.keys(require.cache).find(
      cacheKey => cacheKey.indexOf('/@instana/collector/src/index.js') >= 0
    );
    if (collectorIndexCacheKey) {
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

  log.init(config, false);

  agentConnection = require('./agentConnection');
  const agentOpts = require('./agent/opts');
  const pidStore = require('./pidStore');
  const uncaught = require('./uncaught');

  let logger;
  logger = log.getLogger('index', newLogger => {
    logger = newLogger;
  });
  if (!config.logger) {
    config.logger = logger;
  }

  agentOpts.init(config);
  instanaNodeJsCore.init(config, agentConnection, pidStore);
  instanaSharedMetrics.setLogger(logger);

  if (isMainThread) {
    uncaught.init(config, agentConnection, pidStore);
    require('./metrics').init(config);
  }

  logger.info('@instana/collector module version:', require(path.join(__dirname, '..', 'package.json')).version);
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
 * @param {import('@instana/core/src/logger').GenericLogger} logger
 */
init.setLogger = function setLogger(logger) {
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
