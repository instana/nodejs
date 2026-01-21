/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const constants = require('../constants');

module.exports.init = () => {
  const initStart = Date.now();

  const requireStart = Date.now();
  const { OracleInstrumentation } = require('@opentelemetry/instrumentation-oracledb');
  // eslint-disable-next-line no-console
  console.debug(`[PERF] [OTEL] [ORACLE] OracleInstrumentation require: ${Date.now() - requireStart}ms`);

  const createStart = Date.now();
  const instrumentation = new OracleInstrumentation();
  // eslint-disable-next-line no-console
  console.debug(`[PERF] [OTEL] [ORACLE] OracleInstrumentation creation: ${Date.now() - createStart}ms`);

  const enableStart = Date.now();
  if (!instrumentation.getConfig().enabled) {
    instrumentation.enable();
  }
  // eslint-disable-next-line no-console
  console.debug(`[PERF] [OTEL] [ORACLE] enable: ${Date.now() - enableStart}ms`);

  // eslint-disable-next-line no-console
  console.debug(`[PERF] [OTEL] [ORACLE] TOTAL init: ${Date.now() - initStart}ms`);
};

module.exports.getKind = () => {
  const kind = constants.EXIT;
  return kind;
};
