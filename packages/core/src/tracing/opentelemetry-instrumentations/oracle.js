/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const constants = require('../constants');

let OracleInstrumentation;

function initInstrumentation() {
  OracleInstrumentation =
    OracleInstrumentation || require('@opentelemetry/instrumentation-oracledb').OracleInstrumentation;
}

module.exports.preInit = () => {
  initInstrumentation();
};

module.exports.init = () => {
  initInstrumentation();

  const instrumentation = new OracleInstrumentation();

  if (!instrumentation.getConfig().enabled) {
    instrumentation.enable();
  }
};

module.exports.getKind = () => {
  const kind = constants.EXIT;
  return kind;
};
