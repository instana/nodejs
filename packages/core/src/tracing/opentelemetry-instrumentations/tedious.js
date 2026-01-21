/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const constants = require('../constants');

module.exports.init = () => {
  const initStart = Date.now();

  // Opentelemetry only supports tedious version >=1.11.0 and <=15, please refer the following link
  // for more details: https://www.npmjs.com/package/@opentelemetry/instrumentation-tedious#supported-versions

  const requireStart = Date.now();
  const { TediousInstrumentation } = require('@opentelemetry/instrumentation-tedious');
  // eslint-disable-next-line no-console
  console.debug(`[PERF] [OTEL] [TEDIOUS] TediousInstrumentation require: ${Date.now() - requireStart}ms`);

  const createStart = Date.now();
  const instrumentation = new TediousInstrumentation();
  // eslint-disable-next-line no-console
  console.debug(`[PERF] [OTEL] [TEDIOUS] TediousInstrumentation creation: ${Date.now() - createStart}ms`);

  const enableStart = Date.now();
  if (!instrumentation.getConfig().enabled) {
    instrumentation.enable();
  }
  // eslint-disable-next-line no-console
  console.debug(`[PERF] [OTEL] [TEDIOUS] enable: ${Date.now() - enableStart}ms`);

  // eslint-disable-next-line no-console
  console.debug(`[PERF] [OTEL] [TEDIOUS] TOTAL init: ${Date.now() - initStart}ms`);
};

module.exports.getKind = () => {
  const kind = constants.EXIT;
  return kind;
};
