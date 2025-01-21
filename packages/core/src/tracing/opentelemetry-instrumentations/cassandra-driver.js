/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

// Note: This only added to testing the cassandra instrumentation with existing setup
// Need to remove this once the testing is over
const constants = require('../constants');

module.exports.init = () => {
  // eslint-disable-next-line instana/no-unsafe-require, import/no-extraneous-dependencies
  const { CassandraDriverInstrumentation } = require('@opentelemetry/instrumentation-cassandra-driver');

  const instrumentation = new CassandraDriverInstrumentation();

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
