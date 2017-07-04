'use strict';

var semver = require('semver');

var logger = require('../logger').getLogger('tracing');

var fulfillsPrerequisites = false;

exports.init = function(config) {
  setDefaults(config);
  fulfillsPrerequisites = checkPrerequisites(config);

  if (fulfillsPrerequisites) {
    require('./hook').init(config);
    require('./tracingUtil').init(config);
    require('./transmission').init(config);
    require('./instrumentation/httpServer.js').init(config);
    require('./instrumentation/httpClient.js').init(config);
    require('./instrumentation/elasticsearch.js').init(config);
    require('./instrumentation/mongodb.js').init(config);
    require('./instrumentation/kafka.js').init(config);
    require('./instrumentation/mysql.js').init(config);
  }
};


function setDefaults(config) {
  config.tracing = config.tracing || {};
  config.tracing.enabled = config.tracing.enabled !== false;
}


function checkPrerequisites(config) {
  if (config.tracing && config.tracing.enabled === false) {
    logger.info('Tracing feature is not enabled via config.');
    return false;
  }

  var nodeVersion = process.versions.node;
  if (!exports.supportsAsyncWrap(nodeVersion)) {
    logger.warn('The used Node.js version ' + nodeVersion + ' does not support the features required for tracing. ' +
      'In order to use tracing, please upgrade to a Node.js version ^4.5 || ^5.10 || >=6.0.');
    return false;
  }

  try {
    require('async-hook');
  } catch (e) {
    logger.warn('Could not enable tracing feature due to an error while loading async-hook', {error: e});
    return false;
  }

  return true;
}


exports.supportsAsyncWrap = function supportsAsyncWrap(version) {
  return semver.satisfies(version, '^4.5 || ^5.10 || >=6.0.0 <= 7.0.0');
};


exports.activate = function() {
  if (!fulfillsPrerequisites) {
    return;
  }

  require('./transmission').activate();

  require('./instrumentation/httpServer.js').activate();
  require('./instrumentation/httpClient.js').activate();
  require('./instrumentation/elasticsearch.js').activate();
  require('./instrumentation/mongodb.js').activate();
  require('./instrumentation/kafka.js').activate();
  require('./instrumentation/mysql.js').activate();
  require('./opentracing').activate();
};


exports.deactivate = function() {
  if (!fulfillsPrerequisites) {
    return;
  }

  require('./opentracing').deactivate();
  require('./instrumentation/mysql.js').deactivate();
  require('./instrumentation/kafka.js').deactivate();
  require('./instrumentation/mongodb.js').deactivate();
  require('./instrumentation/elasticsearch.js').deactivate();
  require('./instrumentation/httpServer.js').deactivate();
  require('./instrumentation/httpClient.js').deactivate();

  require('./transmission').deactivate();
};
