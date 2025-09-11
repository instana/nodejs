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
const coreConfig = require('./config');
const coreUtils = require('./util');
const instanaCtr = require('./instanaCtr');

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
 * TODO: `preinit` is needed for all parent packages because we have to initialize the
 *       instrumentations as early as possible. For example, on serverless we use async
 *       calls before we initialize the core module. For the collector, there is an option
 *       to initialize early using `INSTANA_EARLY_INSTRUMENTATION`.
 *
 *       But: `preinit` has a bug.
 *       We initialize our Instana logger by default before initializing.
 *       We use this default Instana logger for `preint`, because we don't have
 *       access to the customers configuration yet!
 *       Some logs will appear BEFORE the actual initialization.
 *       e.g. customer passes a custom log level or a custon logger.
 * @param {import('./config/normalizeConfig').InstanaConfig} preliminaryConfig
 * @param {import('./util/index').CoreUtilsType} utils
 */
function preInit(preliminaryConfig, utils) {
  utils.hasThePackageBeenInitializedTooLate.activate();
  // Initialize secrets as early as possible, in particular for env var collection in fargate/google-cloud-run when
  // the config comes from INSTANA_SECRETS.
  secrets.init(preliminaryConfig);

  tracing.preInit(preliminaryConfig, utils);
}

/**
 *
 * @param {import('./config/normalizeConfig').InstanaConfig} config
 * @param {import('./util/index').CoreUtilsType} utils
 * @param {DownstreamConnection} downstreamConnection
 * @param {import('../../collector/src/pidStore')} processIdentityProvider
 */
function init(config, utils, downstreamConnection, processIdentityProvider) {
  utils.hasThePackageBeenInitializedTooLate.activate();
  secrets.init(config);

  tracing.init(config, utils, downstreamConnection, processIdentityProvider);
}

module.exports = {
  // TODO: Remove this in the next major release.
  logger: {
    init: () => {},
    getLogger: () => {}
  },
  metrics,
  secrets,
  tracing,
  uninstrumentedHttp,
  uninstrumentedFs,
  coreConfig,
  coreUtils,
  init,
  InstanaCtr: instanaCtr.InstanaCtr,
  preInit,
  registerAdditionalInstrumentations
};
