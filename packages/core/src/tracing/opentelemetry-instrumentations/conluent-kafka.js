/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const constants = require('../constants');

module.exports.init = () => {
  const { ConfluentKafkaInstrumentation } = require('@drazke/instrumentation-confluent-kafka-javascript');

  const instrumentation = new ConfluentKafkaInstrumentation();

  if (!instrumentation.getConfig().enabled) {
    instrumentation.enable();
  }
};

module.exports.getKind = () => {
  const kind = constants.EXIT;
  return kind;
};
