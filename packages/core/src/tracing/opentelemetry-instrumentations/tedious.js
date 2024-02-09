/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const constants = require('../constants');

module.exports.init = () => {
  const { TediousInstrumentation } = require('@opentelemetry/instrumentation-tedious');

  const instrumentation = new TediousInstrumentation();

  if (!instrumentation.getConfig().enabled) {
    instrumentation.enable();
  }
};
exports.transform = otelSpan => {
  // NOTE: This assignment is necessary to display the database name in the UI.
  // In the backend, for OpenTelemetry, the service name is based on the OpenTelemetry span attribute service.name.
  if (otelSpan.attributes && 'db.name' in otelSpan.attributes) {
    otelSpan.resource._attributes['service.name'] = otelSpan.attributes['db.name'];
  }
  return otelSpan;
};

module.exports.getKind = () => {
  const kind = constants.EXIT;
  return kind;
};
