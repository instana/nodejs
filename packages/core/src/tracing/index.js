'use strict';

var semver = require('semver');

var sdk = require('./sdk');
var constants = require('./constants');
var opentracing = require('./opentracing');
var spanHandle = require('./spanHandle');
var tracingUtil = require('./tracingUtil');
var spanBuffer = require('./spanBuffer');

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

  tracingEnabled = config.tracing.enabled;
  automaticTracingEnabled = config.tracing.automaticTracingEnabled;

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
