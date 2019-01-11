'use strict';

var semver = require('semver');

var logger;
logger = require('../logger').getLogger('tracing', function(newLogger) {
  logger = newLogger;
});

var tracingEnabled = false;
var automaticTracingEnabled = false;
var config;

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
  './instrumentation/protocols/httpServer'
];
var instrumentationModules = {};

exports.init = function(_config, clsHolder) {
  config = _config;
  setDefaults();

  tracingEnabled = shouldEnableTracing();
  automaticTracingEnabled = tracingEnabled && shouldEnableAutomaticTracing();

  if (tracingEnabled) {
    require('./tracingUtil').init(config);
    require('./transmission').init(config);
    require('./opentracing').init(config, automaticTracingEnabled);

    if (automaticTracingEnabled) {
      // enable instana.currentSpan() function by providing access to the cls module
      clsHolder.cls = require('./cls');
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
      'Not enabling automatic tracing this is an unsupported version of Node.' +
        '  See: https://docs.instana.io/ecosystem/node-js/'
    );
    return false;
  }
  return true;
}

exports.supportedVersion = function supportedVersion(version) {
  return semver.satisfies(version, '^4.5 || ^5.10 || ^6 || ^7 || ^8.2.1 || ^9.1.0 || ^10.4.0 || ^11');
};

exports.activate = function() {
  if (tracingEnabled) {
    require('./transmission').activate();
    require('./opentracing').activate();

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

    require('./opentracing').deactivate();
    require('./transmission').deactivate();
  }
};
