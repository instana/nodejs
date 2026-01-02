/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const sdk = require('./sdk');
const constants = require('./constants');
const tracingMetrics = require('./metrics');
const opentracing = require('./opentracing');
const spanHandle = require('./spanHandle');
const tracingHeaders = require('./tracingHeaders');
const tracingUtil = require('./tracingUtil');
const spanBuffer = require('./spanBuffer');
const shimmer = require('./shimmer');
const supportedVersion = require('./supportedVersion');
const { otelInstrumentations } = require('./opentelemetry-instrumentations');
const cls = require('./cls');
const coreUtil = require('../util');

let tracingEnabled = false;
let tracingActivated = false;
let instrumenationsInitialized = false;
let automaticTracingEnabled = false;

/** @type {import('../config').InstanaConfig} */
let config = null;

/** @typedef {import('../../../collector/src/pidStore')} CollectorPIDStore */

/**
 * @typedef {Object} TracingMetrics
 * @property {number} pid
 * @property {{opened: number, closed: number, dropped: number}} metrics
 */

/** @type {CollectorPIDStore} */
let processIdentityProvider = null;

// Note: Also update initializedTooLateHeuristic.js and the accompanying test when adding instrumentations.
let instrumentations = [
  './instrumentation/cloud/aws-sdk/v2',
  './instrumentation/cloud/aws-sdk/v3',
  './instrumentation/cloud/aws-sdk/v2/sdk',
  './instrumentation/cloud/aws-sdk/v2/sqs',
  './instrumentation/cloud/azure/blob',
  './instrumentation/cloud/gcp/pubsub',
  './instrumentation/cloud/gcp/storage',
  './instrumentation/control_flow/bluebird',
  './instrumentation/control_flow/clsHooked',
  './instrumentation/control_flow/graphqlSubscriptions',
  './instrumentation/databases/elasticsearch',
  './instrumentation/databases/ioredis',
  './instrumentation/databases/memcached',
  './instrumentation/databases/mongodb',
  './instrumentation/databases/mongoose',
  './instrumentation/databases/mssql',
  './instrumentation/databases/mysql',
  './instrumentation/databases/pg',
  './instrumentation/databases/pgNative',
  './instrumentation/databases/prisma',
  './instrumentation/databases/redis',
  './instrumentation/databases/db2',
  './instrumentation/databases/couchbase',
  './instrumentation/frameworks/express',
  './instrumentation/frameworks/fastify',
  './instrumentation/frameworks/hapi',
  './instrumentation/frameworks/koa',
  './instrumentation/logging/bunyan',
  './instrumentation/logging/log4js',
  './instrumentation/logging/pino',
  './instrumentation/logging/winston',
  './instrumentation/logging/console',
  './instrumentation/messaging/amqp',
  './instrumentation/messaging/kafkaJs',
  './instrumentation/messaging/kafkaNode',
  './instrumentation/messaging/rdkafka',
  './instrumentation/messaging/nats',
  './instrumentation/messaging/natsStreaming',
  './instrumentation/messaging/bull',
  './instrumentation/process/memored',
  './instrumentation/process/process',
  './instrumentation/protocols/graphql',
  './instrumentation/protocols/grpcJs',
  './instrumentation/protocols/http2Client',
  './instrumentation/protocols/http2Server',
  './instrumentation/protocols/httpClient',
  './instrumentation/protocols/httpServer',
  './instrumentation/protocols/nativeFetch',
  './instrumentation/protocols/superagent'
];

/**
 * @type {string[]}
 */
const customInstrumentations = process.env.INSTANA_CUSTOM_INSTRUMENTATIONS
  ? process.env.INSTANA_CUSTOM_INSTRUMENTATIONS.split(',')
  : [];
if (customInstrumentations.length > 0) {
  instrumentations = instrumentations.concat(customInstrumentations);
}
/**
 * This is a temporary type definition for instrumented modules until we get to add types to these modules.
 * For now it is safe to say that these modules are objects with the following methods:
 * @typedef {Object} InstanaInstrumentedModule
 * @property {Function} init
 * @property {Function} activate
 * @property {Function} deactivate
 * @property {Function} [updateConfig]
 * @property {boolean} [batchable]
 * @property {string} [spanName]
 * @property {string} [instrumentationName]
 */

/**
 * @typedef {Object} KafkaTracingConfig
 * @property {boolean} [traceCorrelation]
 */

/** @type {Array.<InstanaInstrumentedModule>} */
let additionalInstrumentationModules = [];
/** @type {Object.<string, InstanaInstrumentedModule>} */
const instrumentationModules = {};

exports.constants = constants;
exports.tracingHeaders = tracingHeaders;
exports.opentracing = opentracing;
exports.sdk = sdk;
exports.spanBuffer = spanBuffer;
exports.supportedVersion = supportedVersion;
exports.util = tracingUtil;

/**
 * @param {Array.<InstanaInstrumentedModule>} _additionalInstrumentationModules
 */
exports.registerAdditionalInstrumentations = function registerAdditionalInstrumentations(
  _additionalInstrumentationModules
) {
  additionalInstrumentationModules = additionalInstrumentationModules.concat(_additionalInstrumentationModules);
};

/**
 * @param {import('../config').InstanaConfig} preliminaryConfig
 */
exports.preInit = function preInit(preliminaryConfig) {
  /**
   * On e.g. Fargate the `preInit` function is called as early as possible
   * and all our modules (shimmer, cls, sdk etc.) need to be initialized.
   * Imagine on of these modules logs a warning. The logger module needs to be
   * injected to be able to log anything.
   *
   * `preInit` has a limited functionality e.g. we do not activate the instrumentations.
   *  That means, any span creation would get skipped.
   *
   * `preInit` only monkey patches the libraries as early as possible to be able to start
   * tracing as soon as the data to `init` the core package is fully available.
   *
   * The time between `preInit` and `init` is usually very short, but e.g. on Fargate
   * it can take a bit of time because we are doing an async request to the meta API.
   *
   * Another possible use case is, that its theoretically possible that the customer
   * can already start using the SDK although we are not fully initialized.
   */
  spanHandle.init(preliminaryConfig);
  shimmer.init(preliminaryConfig);
  cls.init(preliminaryConfig);
  sdk.init(preliminaryConfig, cls);

  initInstrumenations(preliminaryConfig);
};

/**
 * @param {import('../config').InstanaConfig} _config
 * @param {import('..').DownstreamConnection} downstreamConnection
 * @param {CollectorPIDStore} _processIdentityProvider
 */
exports.init = function init(_config, downstreamConnection, _processIdentityProvider) {
  if (process.env.INSTANA_DEBUG || process.env.INSTANA_LOG_LEVEL === 'debug') {
    const preloadFlags = coreUtil.preloadFlags.get();

    // eslint-disable-next-line no-console
    console.debug(`The App is using the following preload flags: ${preloadFlags}`);
  }

  config = _config;
  processIdentityProvider = _processIdentityProvider;

  tracingEnabled = config.tracing.enabled;
  automaticTracingEnabled = config.tracing.automaticTracingEnabled;

  spanHandle.init(config);
  shimmer.init(config);

  // NOTE: We have to init cls & SDK if tracing disabled, because
  //       you can use the SDK to create spans and SDK needs CLS.
  //       The initialization only sets the logger and gets ready for traffic.
  cls.init(config, processIdentityProvider);
  sdk.init(config, cls);

  if (tracingEnabled) {
    tracingUtil.init(config);
    tracingHeaders.init(config);
    spanBuffer.init(config, downstreamConnection);
    opentracing.init(config, automaticTracingEnabled, processIdentityProvider);

    if (automaticTracingEnabled) {
      initInstrumenations(config);

      if (_config.tracing.useOpentelemetry) {
        otelInstrumentations.init(config, cls);
      }
      if (coreUtil.esm.isESMApp()) {
        coreUtil.iitmHook.activate();
      }
    }
  }

  // TODO: This is not used anymore. Investigate any usages. Potentially remove/deprecate in the next major release.
  if (config.tracing.activateImmediately) {
    exports.activate();
  }
};

/**
 * @param {import('../config').InstanaConfig} _config
 */
function initInstrumenations(_config) {
  // initialize all instrumentations
  if (!instrumenationsInitialized) {
    instrumentations.forEach(instrumentationKey => {
      instrumentationModules[instrumentationKey] = require(instrumentationKey);

      if (
        !coreUtil.disableInstrumentation.isInstrumentationDisabled({
          instrumentationModules,
          instrumentationKey
        })
      ) {
        instrumentationModules[instrumentationKey].init(_config);
      }

      if (instrumentationModules[instrumentationKey].batchable && instrumentationModules[instrumentationKey].spanName) {
        spanBuffer.addBatchableSpanName(instrumentationModules[instrumentationKey].spanName);
      }
    });

    additionalInstrumentationModules.forEach(instrumentationModule => {
      instrumentationModule.init(_config);
    });

    instrumenationsInitialized = true;
  } else {
    instrumentations.forEach(instrumentationKey => {
      if (instrumentationModules[instrumentationKey].updateConfig) {
        instrumentationModules[instrumentationKey].updateConfig(_config);
      }
    });
  }
}

exports.activate = function activate(extraConfig = {}) {
  if (tracingEnabled && !tracingActivated) {
    tracingActivated = true;
    coreUtil.activate(extraConfig);
    tracingUtil.activate(extraConfig);
    spanBuffer.activate(extraConfig);
    opentracing.activate();
    sdk.activate();

    if (automaticTracingEnabled) {
      instrumentations.forEach(instrumentationKey => {
        // If instrumentation is disabled via agent config, we skip tracing using the `isActive` flag
        // within the instrumentation logic.
        // However, modules already shimmered (e.g., logging) remain wrapped — we don't currently unwrap them.
        // This may lead to minor performance overhead or partial interception. Proper unwrapping via
        // `shimmer.unwrap(...)` would need broader changes. Given the very low performance and functional
        // impact at present, we are accepting this behavior for now.
        //
        // We will revisit this in the future, especially if we encounter issues with disabled instrumentations.
        if (
          !coreUtil.disableInstrumentation.isInstrumentationDisabled({
            instrumentationModules,
            instrumentationKey
          })
        ) {
          instrumentationModules[instrumentationKey].activate(extraConfig);
        }
      });
    }
  }
};

exports.deactivate = function deactivate() {
  if (tracingEnabled && tracingActivated) {
    tracingActivated = false;

    if (automaticTracingEnabled) {
      instrumentations.forEach(instrumentationKey => {
        instrumentationModules[instrumentationKey].deactivate();
      });
    }

    opentracing.deactivate();
    spanBuffer.deactivate();
    sdk.deactivate();
  }
};

exports.getHandleForCurrentSpan = function getHandleForCurrentSpan() {
  return spanHandle.getHandleForCurrentSpan(cls);
};

exports.getCls = function getCls() {
  // This only provides a value if tracing is enabled, otherwise cls will not be required and is null.
  return cls;
};

/**
 * @returns {TracingMetrics}
 */
exports._getAndResetTracingMetrics = function _getAndResetTracingMetrics() {
  return {
    pid:
      processIdentityProvider && typeof processIdentityProvider.getEntityId === 'function'
        ? processIdentityProvider.getEntityId()
        : undefined,
    metrics: tracingMetrics.getAndReset()
  };
};

/**
 * @param {string} name
 * @param {*} module_
 */
exports._instrument = function _instrument(name, module_) {
  if (name === 'superagent') {
    require('./instrumentation/protocols/superagent').instrument(module_);
  } else {
    throw new Error(`An unknown or unsupported instrumentation has been requested: ${name}`);
  }
};

exports._debugCurrentSpanName = function _debugCurrentSpanName() {
  if (!cls) {
    return 'current: no cls';
  }
  const s = cls.ns.get('com.instana.span');
  if (!s) {
    return 'current: no span';
  }
  return `current: ${s.n}`;
};

exports.shimmer = require('./shimmer');
