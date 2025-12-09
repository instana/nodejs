/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const constants = require('../constants');

const isEntrySpan = otelSpan => otelSpan.attributes?.['messaging.operation.type'] === 'deliver';

module.exports.init = () => {
  const { ConfluentKafkaInstrumentation } = require('@drazke/instrumentation-confluent-kafka-javascript');

  const instrumentation = new ConfluentKafkaInstrumentation();

  if (!instrumentation.getConfig().enabled) {
    instrumentation.enable();
  }
};

module.exports.getKind = otelSpan => {
  if (isEntrySpan(otelSpan)) {
    return constants.ENTRY;
  }

  return constants.EXIT;
};
