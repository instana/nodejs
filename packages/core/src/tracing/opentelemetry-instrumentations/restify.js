/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const constants = require('../constants');

let RestifyInstrumentation;

function initInstrumentation() {
  if (!RestifyInstrumentation) {
    RestifyInstrumentation = require('@opentelemetry/instrumentation-restify').RestifyInstrumentation;
  }
}

module.exports.preInit = () => {
  initInstrumentation();
};

module.exports.init = () => {
  initInstrumentation();

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
