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
      require('./instrumentation/httpServer.js').init(config);
      require('./instrumentation/httpClient.js').init(config);
      require('./instrumentation/elasticsearch.js').init(config);
      require('./instrumentation/mongodb.js').init(config);
      require('./instrumentation/kafka.js').init(config);
      require('./instrumentation/mysql.js').init(config);
    }
  }
};


function setDefaults() {
  config.tracing = config.tracing || {};
  config.tracing.enabled = config.tracing.enabled !== false;
}


function shouldEnableTracing() {
  if (config.tracing && config.tracing.enabled === false && exports.supportedVersion(process.versions.node)) {
    logger.info('Not enabling manual tracing as tracing is not enabled via config.');
    return false;
  }

  return true;
}


function shouldEnableAutomaticTracing() {
  if (config.tracing && config.tracing.enabled === false && exports.supportedVersion(process.versions.node)) {
    logger.info('Not enabling automatic tracing as tracing is not enabled via config.');
    return false;
  }

  if (config.tracing && config.tracing.disableAutomaticTracing) {
    logger.info('Not enabling automatic tracing as automatic tracing is disabled via config.');
    return false;
  }
  return true;
}


exports.supportedVersion = function supportedVersion(version) {
  return semver.satisfies(version, '^4.5 || ^5.10 || >=6 <8.0 || >=8.2.1');
};


exports.activate = function() {
  if (tracingEnabled) {
    require('./transmission').activate();
    require('./opentracing').activate();

    if (automaticTracingEnabled) {
      require('./instrumentation/httpServer.js').activate();
      require('./instrumentation/httpClient.js').activate();
      require('./instrumentation/elasticsearch.js').activate();
      require('./instrumentation/mongodb.js').activate();
      require('./instrumentation/kafka.js').activate();
      require('./instrumentation/mysql.js').activate();
    }
  }
};


exports.deactivate = function() {
  if (tracingEnabled) {
    if (automaticTracingEnabled) {
      require('./instrumentation/mysql.js').deactivate();
      require('./instrumentation/kafka.js').deactivate();
      require('./instrumentation/mongodb.js').deactivate();
      require('./instrumentation/elasticsearch.js').deactivate();
      require('./instrumentation/httpServer.js').deactivate();
      require('./instrumentation/httpClient.js').deactivate();
    }

    require('./opentracing').deactivate();
    require('./transmission').deactivate();
  }
};
