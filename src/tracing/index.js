'use strict';

var logger = require('../logger').getLogger('tracing');

var fulfillsPrerequisites = false;

exports.init = function(config) {
  fulfillsPrerequisites = checkPrerequisites(config);

  if (fulfillsPrerequisites) {
    require('./hook').init(config);
    require('./transmission').init(config);
    require('./instrumentation/httpServer.js').init(config);
    require('./instrumentation/httpClient.js').init(config);
    require('./instrumentation/elasticsearch.js').init(config);
    require('./instrumentation/mongodb.js').init(config);
  }
};


function checkPrerequisites(config) {
  if (!config.tracing || !config.tracing.enabled) {
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
  var match = version.match(/^(\d+)\.(\d+)\..*/);
  if (!match) {
    return false;
  }

  var major = parseInt(match[1], 10);
  var minor = parseInt(match[2], 10);

  if (major >= 6) {
    return true;
  } else if (major === 5 && minor >= 10) {
    return true;
  } else if (major === 4 && minor >= 5) {
    return true;
  }

  return false;
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
};


exports.deactivate = function() {
  if (!fulfillsPrerequisites) {
    return;
  }

  require('./instrumentation/mongodb.js').deactivate();
  require('./instrumentation/elasticsearch.js').deactivate();
  require('./instrumentation/httpServer.js').deactivate();
  require('./instrumentation/httpClient.js').deactivate();

  require('./transmission').deactivate();
};
