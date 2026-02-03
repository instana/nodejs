/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const constants = require('../constants');

module.exports.preInit = () => {
  require('@opentelemetry/instrumentation-oracledb');
};

module.exports.init = () => {
  const { OracleInstrumentation } = require('@opentelemetry/instrumentation-oracledb');

  const instrumentation = new OracleInstrumentation();

  if (!instrumentation.getConfig().enabled) {
    instrumentation.enable();
  }
};

module.exports.getKind = () => {
  const kind = constants.EXIT;
  return kind;
};
