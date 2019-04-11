'use strict';

var log = require('./logger');

// Require this first to ensure that we have non-instrumented http available.
var uninstrumentedHttp = require('./uninstrumentedHttp');

module.exports = exports = {
  logger: log,
  metrics: require('./metrics'),
  secrets: require('./secrets'),
  tracing: require('./tracing'),
  uninstrumentedHttp: uninstrumentedHttp,
  util: require('./util')
};

exports.init = function(config, downstreamConnection, processIdentityProvider) {
  log.init(config);
  exports.util.requireHook.init(config);
  exports.tracing.init(config, downstreamConnection, processIdentityProvider);
};
