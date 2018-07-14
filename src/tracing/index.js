'use strict';

var semver = require('semver');

var logger = require('../logger').getLogger('tracing');

var tracingEnabled = false;
var automaticTracingEnabled = false;
var config;

exports.init = function(_config) {
  config = _config;
  setDefaults();

  tracingEnabled = shouldEnableTracing();
  automaticTracingEnabled = tracingEnabled && shouldEnableAutomaticTracing();

  if (tracingEnabled) {
    require('./tracingUtil').init(config);
    require('./transmission').init(config);
    require('./opentracing').init(config, automaticTracingEnabled);

    if (automaticTracingEnabled) {
      require('./instrumentation/bluebird').init(config);
      require('./instrumentation/httpServer').init(config);
      require('./instrumentation/httpClient').init(config);
      require('./instrumentation/elasticsearch').init(config);
      require('./instrumentation/mongodb').init(config);
      require('./instrumentation/kafka').init(config);
      require('./instrumentation/mysql').init(config);
      require('./instrumentation/pg').init(config);
      require('./instrumentation/redis').init(config);
      require('./instrumentation/express').init(config);
      require('./instrumentation/ioredis').init(config);
      require('./instrumentation/fastify').init(config);
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
    logger.info('Not enabling automatic tracing this is an unsupported version of Node.' +
                '  See: https://docs.instana.io/ecosystem/node-js/');
    return false;
  }
  return true;
}


exports.supportedVersion = function supportedVersion(version) {
  return semver.satisfies(version, '^4.5 || ^5.10 || ^6 || ^7 || ^8.2.1 || ^9.1.0 || ^10.0.0');
};


exports.activate = function() {
  if (tracingEnabled) {
    require('./transmission').activate();
    require('./opentracing').activate();

    if (automaticTracingEnabled) {
      require('./instrumentation/bluebird').activate();
      require('./instrumentation/httpServer').activate();
      require('./instrumentation/httpClient').activate();
      require('./instrumentation/elasticsearch').activate();
      require('./instrumentation/mongodb').activate();
      require('./instrumentation/kafka').activate();
      require('./instrumentation/mysql').activate();
      require('./instrumentation/pg').activate();
      require('./instrumentation/redis').activate();
      require('./instrumentation/ioredis').activate();
      require('./instrumentation/express').activate();
      require('./instrumentation/fastify').activate();
    }
  }
};


exports.deactivate = function() {
  if (tracingEnabled) {
    if (automaticTracingEnabled) {
      require('./instrumentation/bluebird').deactivate();
      require('./instrumentation/pg').deactivate();
      require('./instrumentation/mysql').deactivate();
      require('./instrumentation/kafka').deactivate();
      require('./instrumentation/mongodb').deactivate();
      require('./instrumentation/elasticsearch').deactivate();
      require('./instrumentation/httpServer').deactivate();
      require('./instrumentation/httpClient').deactivate();
      require('./instrumentation/redis').deactivate();
      require('./instrumentation/ioredis').deactivate();
      require('./instrumentation/express').deactivate();
      require('./instrumentation/fastify').deactivate();
    }

    require('./opentracing').deactivate();
    require('./transmission').deactivate();
  }
};
