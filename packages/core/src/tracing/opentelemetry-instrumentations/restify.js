/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const constants = require('../constants');

module.exports.preInit = () => {
  require('@opentelemetry/instrumentation-restify');
};

module.exports.init = () => {
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
