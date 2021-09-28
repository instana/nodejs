/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const log = require('./logger');
const normalizeConfig = require('./util/normalizeConfig');

// Require this first to ensure that we have non-instrumented http available.
const uninstrumentedHttp = require('./uninstrumentedHttp');
const metrics = require('./metrics');
const secrets = require('./secrets');
const tracing = require('./tracing');
const util = require('./util');

/**
 * @typedef {{
    h?: string,
    e?: string,
    hl?: boolean,
    cp?: string,
   }} PIDData
 */

/**
 * @typedef {Object} InstanaCore
 * @property {import('./metrics/index')} metrics
 * @property {import('./secrets')} secrets
 * @property {import('./tracing/index')} tracing
 */

/** @typedef {import('../../collector/src/agentConnection').AgentConnectionEvent} AgentConnectionEvent */

/**
 * This type is based on /nodejs/packages/collector/src/agentConnection.js
 * @typedef {Object} DownstreamConnection
 * @property {(spans: *, cb: Function) => void} sendSpans
 * @property {(eventData: AgentConnectionEvent, cb: (...args: *) => *) => void} sendEvent
 */

/**
 * @param {Array.<import('./tracing/index').InstanaInstrumentedModule>} additionalInstrumentationModules
 */
function registerAdditionalInstrumentations(additionalInstrumentationModules) {
  tracing.registerAdditionalInstrumentations(additionalInstrumentationModules);
}

function preInit() {
  const preliminaryConfig = normalizeConfig();
  util.hasThePackageBeenInitializedTooLate();
  util.requireHook.init(preliminaryConfig);
  tracing.preInit(preliminaryConfig);
  // Initialize secrets as early as possible, in particular for env var collection in fargate/google-cloud-run when
  // the config comes from INSTANA_SECRETS.
  secrets.init(/** @type {secrets.SecretOption} */ (preliminaryConfig));
}

/**
 *
 * @param {import('./util/normalizeConfig').InstanaConfig} config
 * @param {DownstreamConnection} downstreamConnection
 * @param {import('../../collector/src/pidStore')} processIdentityProvider
 */
function init(config, downstreamConnection, processIdentityProvider) {
  log.init(/** @type {log.LoggerConfig} */ (config));
  util.hasThePackageBeenInitializedTooLate();
  config = normalizeConfig(config);
  secrets.init(/** @type {secrets.SecretOption} */ (config));
  util.requireHook.init(config);
  tracing.init(config, downstreamConnection, processIdentityProvider);
}

module.exports = {
  logger: log,
  metrics,
  secrets,
  tracing,
  uninstrumentedHttp,
  util,
  init,
  preInit,
  registerAdditionalInstrumentations
};
