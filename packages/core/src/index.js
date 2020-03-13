'use strict';

var log = require('./logger');
var normalizeConfig = require('./util/normalizeConfig');

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

exports.registerAdditionalInstrumentations = function(additionalInstrumentationModules) {
  exports.tracing.registerAdditionalInstrumentations(additionalInstrumentationModules);
};

exports.preInit = function() {
  var preliminaryConfig = normalizeConfig();
  exports.util.requireHook.init(preliminaryConfig);
  exports.tracing.preInit(preliminaryConfig);
};

exports.init = function(config, downstreamConnection, processIdentityProvider) {
  log.init(config);
  exports.util.hasThePackageBeenInitializedTooLate();
  config = normalizeConfig(config);
  exports.secrets.init(config);
  exports.util.requireHook.init(config);
  exports.tracing.init(config, downstreamConnection, processIdentityProvider);
};
