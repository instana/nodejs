/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const constants = require('../constants');
const { setW3CTraceContext, extractW3CTraceContext } = require('./utils');

let ConfluentKafkaInstrumentation;
let isActive = false;

function initInstrumentation() {
  if (!ConfluentKafkaInstrumentation) {
    ConfluentKafkaInstrumentation =
      require('@instana/instrumentation-confluent-kafka-javascript').ConfluentKafkaInstrumentation;
    isActive = true;
  }
}

module.exports.isActive = () => isActive;

module.exports.preInit = () => {
  initInstrumentation();
};

module.exports.init = () => {
  initInstrumentation();

  const instrumentation = new ConfluentKafkaInstrumentation({});

  if (!instrumentation.getConfig().enabled) {
    instrumentation.enable();
  }
};

module.exports.getKind = otelSpan => {
  if (otelSpan.attributes?.['messaging.operation.type'] === 'receive') {
    return constants.ENTRY;
  }

  return constants.EXIT;
};

module.exports.setW3CTraceContext = setW3CTraceContext;
module.exports.extractW3CTraceContext = extractW3CTraceContext;
