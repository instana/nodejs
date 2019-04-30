'use strict';

var semver = require('semver');

var sdk = require('./sdk');
var constants = require('./constants');
var opentracing = require('./opentracing');
var spanHandle = require('./spanHandle');
var tracingUtil = require('./tracingUtil');
var spanBuffer = require('./spanBuffer');

var logger;
logger = require('../logger').getLogger('tracing', function(newLogger) {
  logger = newLogger;
});

var tracingEnabled = false;
var automaticTracingEnabled = false;
var cls = null;
var config = null;
var extraHeaders = [];

var httpServerInstrumentation = './instrumentation/protocols/httpServer';
var instrumentations = [
  './instrumentation/control_flow/bluebird',
  './instrumentation/database/elasticsearch',
  './instrumentation/database/ioredis',
  './instrumentation/database/mongodb',
  './instrumentation/database/mssql',
  './instrumentation/database/mysql',
  './instrumentation/database/pg',
  './instrumentation/database/redis',
  './instrumentation/frameworks/express',
  './instrumentation/frameworks/fastify',
  './instrumentation/frameworks/koa',
  './instrumentation/loggers/bunyan',
  './instrumentation/loggers/pino',
  './instrumentation/loggers/winston',
  './instrumentation/messaging/amqp',
  './instrumentation/messaging/kafka',
  './instrumentation/protocols/grpc',
  './instrumentation/protocols/httpClient',
  httpServerInstrumentation
];
var instrumentationModules = {};

exports.constants = constants;
exports.opentracing = opentracing;
exports.sdk = sdk;
exports.spanBuffer = spanBuffer;

exports.init = function(_config, downstreamConnection, processIdentityProvider) {
  config = _config;
  setDefaults();

  tracingEnabled = shouldEnableTracing();
  automaticTracingEnabled = tracingEnabled && shouldEnableAutomaticTracing();

  if (tracingEnabled) {
    tracingUtil.init(config);
    spanBuffer.init(config, downstreamConnection);
    opentracing.init(config, automaticTracingEnabled, processIdentityProvider);
    cls = require('./cls');
    cls.init(processIdentityProvider);
    sdk.init(cls);

    if (automaticTracingEnabled) {
      // initialize all instrumentations
      instrumentations.forEach(function(instrumentationKey) {
        instrumentationModules[instrumentationKey] = require(instrumentationKey);
        instrumentationModules[instrumentationKey].init(config);
      });
    }
  }
};

function setDefaults() {
  config.tracing = config.tracing || {};
  config.tracing.enabled = config.tracing.enabled !== false;
  config.tracing.http = config.tracing.http || {};
  if (!config.tracing.http.extraHttpHeadersToCapture) {
    config.tracing.http.extraHttpHeadersToCapture = extraHeaders;
  } else if (!Array.isArray(config.tracing.http.extraHttpHeadersToCapture)) {
    logger.warn(
      'Invalid configuration: config.tracing.http.extraHttpHeadersToCapture is not an array, ' +
        'the value will be ignored: ' +
        JSON.stringify(config.tracing.http.extraHttpHeadersToCapture)
    );
    config.tracing.http.extraHttpHeadersToCapture = extraHeaders;
  }
}

function shouldEnableTracing() {
  if (config.tracing && config.tracing.enabled === false) {
    logger.info('Not enabling manual tracing as tracing is not enabled via config.');
    return false;
  }

  return true;
}

function shouldEnableAutomaticTracing() {
  if (config.tracing && config.tracing.enabled === false) {
    logger.info('Not enabling automatic tracing as tracing is not enabled via config.');
    return false;
  }

  if (config.tracing && config.tracing.disableAutomaticTracing) {
    logger.info('Not enabling automatic tracing as automatic tracing is disabled via config.');
    return false;
  }

  if (!exports.supportedVersion(process.versions.node)) {
    logger.info(
      'Not enabling automatic tracing, this is an unsupported version of Node.js. ' +
        'See: https://docs.instana.io/ecosystem/node-js/#supported-nodejs-versions'
    );
    return false;
  }
  return true;
}

exports.supportedVersion = function supportedVersion(version) {
  return semver.satisfies(version, '^4.5 || ^5.10 || ^6 || ^7 || ^8.2.1 || ^9.1.0 || ^10.4.0 || ^11 || >=12.0.0');
};

exports.activate = function() {
  if (tracingEnabled) {
    spanBuffer.activate();
    opentracing.activate();
    sdk.activate();

    if (automaticTracingEnabled) {
      instrumentations.forEach(function(instrumentationKey) {
        instrumentationModules[instrumentationKey].activate();
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
