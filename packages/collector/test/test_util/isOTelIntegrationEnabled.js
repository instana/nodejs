/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const semver = require('semver');

const minimumNodeJsVersionForOTelIntegration =
  require('../../../core/src/tracing/opentelemetry-instrumentations/wrap').minimumNodeJsVersion;
const oTelIntegrationIsEnabled = semver.gte(process.versions.node, minimumNodeJsVersionForOTelIntegration);

module.exports = exports = oTelIntegrationIsEnabled;
