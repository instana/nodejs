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
const supportedVersion = require('./supportedVersion');
const { otelInstrumentations } = require('./opentelemetry-instrumentations');
const {
  esmSupportedVersion,
  isLatestEsmSupportedVersion,
  hasExperimentalLoaderFlag,
  isESMApp
} = require('../util/esm');
const iitmHook = require('../util/iitmHook');
const { logPackageInstallation } = require('../util/logPackageInstallation');

let tracingEnabled = false;
let tracingActivated = false;
let instrumenationsInitialized = false;
let automaticTracingEnabled = false;
/** @type {import('./cls')} */
let cls = null;
/** @type {import('../util/normalizeConfig').InstanaConfig} */
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
  './instrumentation/cloud/aws-sdk/v2/index',
  './instrumentation/cloud/aws-sdk/v3/index',
  './instrumentation/cloud/aws-sdk/v2/sdk',
  './instrumentation/cloud/aws-sdk/v2/sqs',
  './instrumentation/cloud/azure/blob',
  './instrumentation/cloud/gcp/pubsub',
  './instrumentation/cloud/gcp/storage',
  './instrumentation/control_flow/bluebird',
  './instrumentation/control_flow/clsHooked',
  './instrumentation/control_flow/graphqlSubscriptions',
  './instrumentation/control_flow/q',
  './instrumentation/database/elasticsearch',
  './instrumentation/database/ioredis',
  './instrumentation/database/memcached',
  './instrumentation/database/mongodb',
  './instrumentation/database/mongoose',
  './instrumentation/database/mssql',
  './instrumentation/database/mysql',
  './instrumentation/database/pg',
  './instrumentation/database/pgNative',
  './instrumentation/database/prisma',
  './instrumentation/database/redis',
  './instrumentation/database/db2',
  './instrumentation/database/couchbase',
  './instrumentation/frameworks/express',
  './instrumentation/frameworks/fastify',
  './instrumentation/frameworks/hapi',
  './instrumentation/frameworks/koa',
  './instrumentation/loggers/bunyan',
  './instrumentation/loggers/log4js',
  './instrumentation/loggers/pino',
  './instrumentation/loggers/winston',
  './instrumentation/loggers/console',
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
 * @property {string} [headerFormat]
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
exports.esmSupportedVersion = esmSupportedVersion;
exports.isLatestEsmSupportedVersion = isLatestEsmSupportedVersion;

/**
 * @param {import('../util/normalizeConfig').InstanaConfig} cfg
 * @param {string} instrumentationKey
 */
const isInstrumentationDisabled = (cfg, instrumentationKey) => {
  // Extracts the instrumentation name using the pattern '.\/instrumentation\/[^/]*\/(.*)',
  // capturing the part after '/instrumentation/.../'. If this pattern doesn't match,
  // it falls back to extracting the last part of the path after the final '/'.
  // This is primarily implemented to handle customInstrumentation cases.
  const matchResult = instrumentationKey.match(/.\/instrumentation\/[^/]*\/(.*)/);
  const extractedInstrumentationName = matchResult ? matchResult[1] : instrumentationKey.match(/\/([^/]+)$/)[1];
  return (
    cfg.tracing.disabledTracers.includes(extractedInstrumentationName.toLowerCase()) ||
    (instrumentationModules[instrumentationKey].instrumentationName &&
      cfg.tracing.disabledTracers.includes(instrumentationModules[instrumentationKey].instrumentationName))
  );
};

/**
 * @param {Array.<InstanaInstrumentedModule>} _additionalInstrumentationModules
 */
exports.registerAdditionalInstrumentations = function registerAdditionalInstrumentations(
  _additionalInstrumentationModules
) {
  additionalInstrumentationModules = additionalInstrumentationModules.concat(_additionalInstrumentationModules);
};

/**
 * @param {import('../util/normalizeConfig').InstanaConfig} preliminaryConfig
 */
exports.preInit = function preInit(preliminaryConfig) {
  initInstrumenations(preliminaryConfig);
};

/**
 * @param {import('../util/normalizeConfig').InstanaConfig} _config
 * @param {import('..').DownstreamConnection} downstreamConnection
 * @param {CollectorPIDStore} _processIdentityProvider
 */
exports.init = function init(_config, downstreamConnection, _processIdentityProvider) {
  // Logs the instana instrumentation method of client application in debug mode
  logPackageInstallation();

  // Consider removing this in the next major release(v4.x) of the @instana package.
  if (hasExperimentalLoaderFlag()) {
    // eslint-disable-next-line no-console
    console.warn(
      'Node.js introduced breaking changes in versions 18.19.0 and above, leading to the discontinuation of support ' +
        `for the --experimental-loader flag by Instana. The current Node.js version is ${process.version}. ` +
        "To ensure tracing by Instana, please use the '--import' flag instead. For more information, " +
        'refer to the Instana documentation: ' +
        'https://www.ibm.com/docs/en/instana-observability/current?topic=nodejs-collector-installation.'
    );
  }
  config = _config;
  processIdentityProvider = _processIdentityProvider;

  tracingEnabled = config.tracing.enabled;
  automaticTracingEnabled = config.tracing.automaticTracingEnabled;

  if (tracingEnabled) {
    tracingUtil.init(config);
    tracingHeaders.init(config);
    spanBuffer.init(config, downstreamConnection);
    opentracing.init(config, automaticTracingEnabled, processIdentityProvider);
    cls = require('./cls');
    cls.init(config, processIdentityProvider);
    sdk.init(cls);

    if (automaticTracingEnabled) {
      initInstrumenations(config);

      if (_config.tracing.useOpentelemetry) {
        otelInstrumentations.init(config, cls);
      }
      if (isESMApp()) {
        iitmHook.init();
      }
    }
  }

  if (config.tracing.activateImmediately) {
    exports.activate();
  }
};

/**
 * @param {import('../util/normalizeConfig').InstanaConfig} _config
 */
function initInstrumenations(_config) {
  // initialize all instrumentations
  if (!instrumenationsInitialized) {
    instrumentations.forEach(instrumentationKey => {
      instrumentationModules[instrumentationKey] = require(instrumentationKey);

      if (!isInstrumentationDisabled(_config, instrumentationKey)) {
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
    spanBuffer.activate(extraConfig);
    opentracing.activate();
    sdk.activate();

    if (automaticTracingEnabled) {
      instrumentations.forEach(instrumentationKey => {
        if (!isInstrumentationDisabled(config, instrumentationKey)) {
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
