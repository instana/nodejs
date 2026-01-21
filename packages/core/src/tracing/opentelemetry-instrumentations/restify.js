/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const constants = require('../constants');

module.exports.init = () => {
  const initStart = Date.now();

  const requireStart = Date.now();
  const { RestifyInstrumentation } = require('@opentelemetry/instrumentation-restify');
  // eslint-disable-next-line no-console
  console.debug(`[PERF] [OTEL] [RESTIFY] RestifyInstrumentation require: ${Date.now() - requireStart}ms`);

  const createStart = Date.now();
  const instrumentation = new RestifyInstrumentation();
  // eslint-disable-next-line no-console
  console.debug(`[PERF] [OTEL] [RESTIFY] RestifyInstrumentation creation: ${Date.now() - createStart}ms`);

  const enableStart = Date.now();
  if (!instrumentation.getConfig().enabled) {
    instrumentation.enable();
  }
  // eslint-disable-next-line no-console
  console.debug(`[PERF] [OTEL] [RESTIFY] enable: ${Date.now() - enableStart}ms`);

  // eslint-disable-next-line no-console
  console.debug(`[PERF] [OTEL] [RESTIFY] TOTAL init: ${Date.now() - initStart}ms`);
};

module.exports.getKind = otelSpan => {
  let kind = constants.EXIT;

  if (otelSpan.attributes && otelSpan.attributes['restify.type'] === 'middleware') {
    kind = constants.INTERMEDIATE;
  }

  return kind;
};
