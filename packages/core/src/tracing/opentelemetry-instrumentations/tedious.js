/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const constants = require('../constants');

module.exports.init = () => {
  // Opentelemetry only supports tedious version >=1.11.0 and <=15, please refer the following link
  // for more details: https://www.npmjs.com/package/@opentelemetry/instrumentation-tedious#supported-versions

  const { TediousInstrumentation } = require('@opentelemetry/instrumentation-tedious');

  const instrumentation = new TediousInstrumentation();

  if (!instrumentation.getConfig().enabled) {
    instrumentation.enable();
  }
};

module.exports.getKind = () => {
  const kind = constants.EXIT;
  return kind;
};
