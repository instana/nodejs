'use strict';

const sdk = require('./sdk');
const constants = require('./constants');
const tracingMetrics = require('./metrics');
const opentracing = require('./opentracing');
const spanHandle = require('./spanHandle');
const tracingUtil = require('./tracingUtil');
const spanBuffer = require('./spanBuffer');
const supportedVersion = require('./supportedVersion');

let tracingEnabled = false;
let instrumenationsInitialized = false;
let automaticTracingEnabled = false;
let cls = null;
let config = null;
let extraHeaders = [];
let processIdentityProvider = null;

// Note: Also update initializedTooLateHeuristic.js and the accompanying test when adding instrumentations.
const instrumentations = [
  './instrumentation/cloud/aws/sdk',
  './instrumentation/cloud/gcp/pubsub',
  './instrumentation/cloud/gcp/storage',
  './instrumentation/control_flow/bluebird',
  './instrumentation/control_flow/graphqlSubscriptions',
  './instrumentation/database/elasticsearchLegacy',
  './instrumentation/database/elasticsearchModern',
  './instrumentation/database/ioredis',
  './instrumentation/database/mongodb',
  './instrumentation/database/mongoose',
  './instrumentation/database/mssql',
  './instrumentation/database/mysql',
  './instrumentation/database/pg',
  './instrumentation/database/pgNative',
  './instrumentation/database/redis',
  './instrumentation/frameworks/express',
  './instrumentation/frameworks/fastify',
  './instrumentation/frameworks/hapi',
  './instrumentation/frameworks/koa',
  './instrumentation/loggers/bunyan',
  './instrumentation/loggers/log4js',
  './instrumentation/loggers/pino',
  './instrumentation/loggers/winston',
  './instrumentation/messaging/amqp',
  './instrumentation/messaging/kafkaJs',
  './instrumentation/messaging/kafkaNode',
  './instrumentation/messaging/nats',
  './instrumentation/messaging/natsStreaming',
  './instrumentation/process/memored',
  './instrumentation/protocols/graphql',
  './instrumentation/protocols/grpc',
  './instrumentation/protocols/httpClient',
  './instrumentation/protocols/httpServer',
  './instrumentation/protocols/http2Client',
  './instrumentation/protocols/http2Server',
  './instrumentation/protocols/superagent'
];
let additionalInstrumentationModules = [];
const instrumentationModules = {};

exports.constants = constants;
exports.opentracing = opentracing;
exports.sdk = sdk;
exports.spanBuffer = spanBuffer;
exports.supportedVersion = supportedVersion;

exports.registerAdditionalInstrumentations = function registerAdditionalInstrumentations(
  _additionalInstrumentationModules
) {
  additionalInstrumentationModules = additionalInstrumentationModules.concat(_additionalInstrumentationModules);
};

exports.preInit = function preInit(preliminaryConfig) {
  initInstrumenations(preliminaryConfig);
};

exports.init = function init(_config, downstreamConnection, _processIdentityProvider) {
  config = _config;
  processIdentityProvider = _processIdentityProvider;

  tracingEnabled = config.tracing.enabled;
  automaticTracingEnabled = config.tracing.automaticTracingEnabled;

  if (tracingEnabled) {
    tracingUtil.init(config);
    spanBuffer.init(config, downstreamConnection);
    opentracing.init(config, automaticTracingEnabled, processIdentityProvider);
    cls = require('./cls');
    cls.init(config, processIdentityProvider);
    sdk.init(cls);

    if (automaticTracingEnabled) {
      initInstrumenations(config);
    }
  }
};

function initInstrumenations(_config) {
  // initialize all instrumentations
  if (!instrumenationsInitialized) {
    instrumentations.forEach(instrumentationKey => {
      instrumentationModules[instrumentationKey] = require(instrumentationKey);
      instrumentationModules[instrumentationKey].init(_config);
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

exports.activate = function activate() {
  if (tracingEnabled) {
    spanBuffer.activate();
    opentracing.activate();
    sdk.activate();

    if (automaticTracingEnabled) {
      instrumentations.forEach(instrumentationKey => {
        const instrumentationName = /.\/instrumentation\/[^/]*\/(.*)/.exec(instrumentationKey)[1];
        const isDisabled =
          config.tracing.disabledTracers.findIndex(disabledKey => instrumentationName.toLowerCase() === disabledKey) !==
          -1;
        if (!isDisabled) {
          instrumentationModules[instrumentationKey].activate();
        }
      });
    }
  }
};

exports.deactivate = function deactivate() {
  if (tracingEnabled) {
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

exports.setExtraHttpHeadersToCapture = function setExtraHttpHeadersToCapture(_extraHeaders) {
  extraHeaders = _extraHeaders;
  instrumentations.forEach(instrumentationKey => {
    if (
      instrumentationModules[instrumentationKey] &&
      typeof instrumentationModules[instrumentationKey].setExtraHttpHeadersToCapture === 'function'
    ) {
      instrumentationModules[instrumentationKey].setExtraHttpHeadersToCapture(extraHeaders);
    }
  });
};

exports._getAndResetTracingMetrics = function _getAndResetTracingMetrics() {
  return {
    pid:
      processIdentityProvider && typeof processIdentityProvider.getEntityId === 'function'
        ? processIdentityProvider.getEntityId()
        : undefined,
    metrics: tracingMetrics.getAndReset()
  };
};

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
