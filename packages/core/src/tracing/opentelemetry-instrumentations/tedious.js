/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const constants = require('../constants');

let TediousInstrumentation;

function initInstrumentation() {
  TediousInstrumentation =
    TediousInstrumentation || require('@opentelemetry/instrumentation-tedious').TediousInstrumentation;
}

module.exports.preInit = () => {
  initInstrumentation();
};

module.exports.init = () => {
  // Opentelemetry only supports tedious version >=1.11.0 and <=15, please refer the following link
  // for more details: https://www.npmjs.com/package/@opentelemetry/instrumentation-tedious#supported-versions

  initInstrumentation();

  const instrumentation = new TediousInstrumentation();

  if (!instrumentation.getConfig().enabled) {
    instrumentation.enable();
  }
};

module.exports.getKind = () => {
  const kind = constants.EXIT;
  return kind;
};
