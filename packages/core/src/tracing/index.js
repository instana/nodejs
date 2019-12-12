'use strict';

var sdk = require('./sdk');
var constants = require('./constants');
var tracingMetrics = require('./metrics');
var opentracing = require('./opentracing');
var spanHandle = require('./spanHandle');
var tracingUtil = require('./tracingUtil');
var spanBuffer = require('./spanBuffer');
var supportedVersion = require('./supportedVersion');

var tracingEnabled = false;
var instrumenationsInitialized = false;
var automaticTracingEnabled = false;
var cls = null;
var config = null;
var extraHeaders = [];
var processIdentityProvider = null;

var httpServerInstrumentation = './instrumentation/protocols/httpServer';
var instrumentations = [
  './instrumentation/control_flow/bluebird',
  './instrumentation/control_flow/graphqlSubscriptions',
  './instrumentation/database/elasticsearch',
  './instrumentation/database/ioredis',
  './instrumentation/database/mongodb',
  './instrumentation/database/mssql',
  './instrumentation/database/mysql',
  './instrumentation/database/pg',
  './instrumentation/database/redis',
  './instrumentation/frameworks/awsSdk',
  './instrumentation/frameworks/express',
  './instrumentation/frameworks/fastify',
  './instrumentation/frameworks/hapi',
  './instrumentation/frameworks/koa',
  './instrumentation/loggers/bunyan',
  './instrumentation/loggers/pino',
  './instrumentation/loggers/winston',
  './instrumentation/messaging/amqp',
  './instrumentation/messaging/kafkaJs',
  './instrumentation/messaging/kafkaNode',
  './instrumentation/messaging/nats',
  './instrumentation/messaging/natsStreaming',
  './instrumentation/protocols/graphql',
  './instrumentation/protocols/grpc',
  './instrumentation/protocols/httpClient',
  httpServerInstrumentation
];
var instrumentationModules = {};

exports.constants = constants;
exports.opentracing = opentracing;
exports.sdk = sdk;
exports.spanBuffer = spanBuffer;
exports.supportedVersion = supportedVersion;

exports.preInit = function(preliminaryConfig) {
  initInstrumenations(preliminaryConfig);
};

exports.init = function(_config, downstreamConnection, _processIdentityProvider) {
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
    instrumentations.forEach(function(instrumentationKey) {
      instrumentationModules[instrumentationKey] = require(instrumentationKey);
      instrumentationModules[instrumentationKey].init(_config);
    });
    instrumenationsInitialized = true;
  } else {
    instrumentations.forEach(function(instrumentationKey) {
      if (instrumentationModules[instrumentationKey].updateConfig) {
        instrumentationModules[instrumentationKey].updateConfig(_config);
      }
    });
  }
}

exports.activate = function() {
  if (tracingEnabled) {
    spanBuffer.activate();
    opentracing.activate();
    sdk.activate();

    if (automaticTracingEnabled) {
      instrumentations.forEach(function(instrumentationKey) {
        var isDisabled = !!config.tracing.disabledTracers.find(function(disabledKey) {
          return instrumentationKey.toLowerCase().indexOf(disabledKey) >= 0;
        });
        if (!isDisabled) {
          instrumentationModules[instrumentationKey].activate();
        }
      });
    }
  }
};

exports.deactivate = function() {
  if (tracingEnabled) {
    if (automaticTracingEnabled) {
      instrumentations.forEach(function(instrumentationKey) {
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

exports._getAndResetTracingMetrics = function _getAndResetTracingMetrics() {
  return {
    pid:
      processIdentityProvider && typeof processIdentityProvider.getEntityId === 'function'
        ? processIdentityProvider.getEntityId()
        : undefined,
    metrics: tracingMetrics.getAndReset()
  };
};

exports._debugCurrentSpanName = function _debugCurrentSpanName() {
  if (!cls) {
    return 'current: no cls';
  }
  var s = cls.ns.get('com.instana.span');
  if (!s) {
    return 'current: no span';
  }
  return 'current:' + s.n;
};

exports.setExtraHttpHeadersToCapture = function setExtraHttpHeadersToCapture(_extraHeaders) {
  extraHeaders = _extraHeaders;
  if (instrumentationModules[httpServerInstrumentation]) {
    instrumentationModules[httpServerInstrumentation].setExtraHttpHeadersToCapture(extraHeaders);
  }
};
