/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2019
 */

'use strict';

const log = require('./logger');
const normalizeConfig = require('./util/normalizeConfig');

// Require this first to ensure that we have non-instrumented http available.
const uninstrumentedHttp = require('./uninstrumentedHttp');

module.exports = exports = {
  logger: log,
  metrics: require('./metrics'),
  secrets: require('./secrets'),
  tracing: require('./tracing'),
  uninstrumentedHttp,
  util: require('./util')
};

exports.registerAdditionalInstrumentations = function registerAdditionalInstrumentations(
  additionalInstrumentationModules
) {
  exports.tracing.registerAdditionalInstrumentations(additionalInstrumentationModules);
};

exports.preInit = function preInit() {
  var preliminaryConfig = normalizeConfig();
  exports.util.hasThePackageBeenInitializedTooLate();
  exports.util.requireHook.init(preliminaryConfig);
  exports.tracing.preInit(preliminaryConfig);
};

exports.init = function init(config, downstreamConnection, processIdentityProvider) {
  log.init(config);
  exports.util.hasThePackageBeenInitializedTooLate();
  config = normalizeConfig(config);
  exports.secrets.init(config);
  exports.util.requireHook.init(config);
  exports.tracing.init(config, downstreamConnection, processIdentityProvider);
};
