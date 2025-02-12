/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

// Require this first to ensure that we have non-instrumented http available.
const uninstrumentedHttp = require('./uninstrumentedHttp');
const uninstrumentedFs = require('./uninstrumentedFs');

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

/** @typedef {import('../../collector/src/agentConnection').Event} Event */

/**
 * This type is based on /nodejs/packages/collector/src/agentConnection.js
 * @typedef {Object} DownstreamConnection
 * @property {(spans: *, cb: Function) => void} sendSpans
 * @property {(eventData: Event, cb: (...args: *) => *) => void} sendEvent
 */

/**
 * @param {Array.<import('./tracing/index').InstanaInstrumentedModule>} additionalInstrumentationModules
 */
function registerAdditionalInstrumentations(additionalInstrumentationModules) {
  tracing.registerAdditionalInstrumentations(additionalInstrumentationModules);
}

/**
 * TODO: `preinit` is needed on serverless because we have to initialize the
 *       instrumentations as early as possible. On serverless we use async
 *       calls before we initialize the core module. But: `preinit` is broken,
 *       because we use our default serverless logger, which ignores the config
 *       from the customer (such as log level) and some logs would appear BEFORE
 *       the core initialization because of the `preinit` call.
 * @param {import('./util/normalizeConfig').InstanaConfig} preliminaryConfig
 */
function preInit(preliminaryConfig) {
  util.init(preliminaryConfig);
  util.hasThePackageBeenInitializedTooLate.activate();
  tracing.preInit(preliminaryConfig);
  // Initialize secrets as early as possible, in particular for env var collection in fargate/google-cloud-run when
  // the config comes from INSTANA_SECRETS.
  secrets.init(preliminaryConfig);
}

/**
 *
 * @param {import('./util/normalizeConfig').InstanaConfig} config
 * @param {DownstreamConnection} downstreamConnection
 * @param {import('../../collector/src/pidStore')} processIdentityProvider
 */
function init(config, downstreamConnection, processIdentityProvider) {
  util.init(config);
  util.hasThePackageBeenInitializedTooLate.activate();
  secrets.init(config);
  tracing.init(config, downstreamConnection, processIdentityProvider);
}

module.exports = {
  metrics,
  secrets,
  tracing,
  uninstrumentedHttp,
  uninstrumentedFs,
  util,
  init,
  preInit,
  registerAdditionalInstrumentations
};
