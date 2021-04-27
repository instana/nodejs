/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

// @ts-nocheck

'use strict';

const log = require('./logger');
const normalizeConfig = require('./util/normalizeConfig');

// Require this first to ensure that we have non-instrumented http available.
const uninstrumentedHttp = require('./uninstrumentedHttp');

/**
 * @typedef {{
    h?: string,
    e?: string,
    hl?: boolean,
    cp?: string,
   }} PIDData
 */

/**
 * @typedef {Object} ProcessIdentityProvider
 * @property {() => PIDData} getFrom
 */

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
  // Initialize secrets as early as possible, in particular for env var collection in fargate/google-cloud-run when
  // the config comes from INSTANA_SECRETS.
  exports.secrets.init(preliminaryConfig);
};

exports.init = function init(config, downstreamConnection, processIdentityProvider) {
  log.init(config);
  exports.util.hasThePackageBeenInitializedTooLate();
  config = normalizeConfig(config);
  exports.secrets.init(config);
  exports.util.requireHook.init(config);
  exports.tracing.init(config, downstreamConnection, processIdentityProvider);
};
