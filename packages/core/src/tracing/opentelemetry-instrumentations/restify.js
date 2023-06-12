/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const semver = require('semver');
const constants = require('../constants');

module.exports.init = () => {
  // No support for Node v18 yet.
  // https://github.com/restify/node-restify/issues/1925
  // https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1339
  if (!semver.lt(process.versions.node, '18.0.0')) return;

  const { RestifyInstrumentation } = require('@opentelemetry/instrumentation-restify');

  const instrumentation = new RestifyInstrumentation();

  if (!instrumentation.getConfig().enabled) {
    instrumentation.enable();
  }
};

module.exports.getKind = otelSpan => {
  let kind = constants.EXIT;

  if (otelSpan.attributes && otelSpan.attributes['restify.type'] === 'middleware') {
    kind = constants.INTERMEDIATE;
  }

  return kind;
};
