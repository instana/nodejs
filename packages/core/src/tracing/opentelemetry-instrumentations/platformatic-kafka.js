/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const constants = require('../constants');
const { setW3CTraceContext, extractW3CTraceContext } = require('./utils');

let KafkaInstrumentation;
let isActive = false;

function initInstrumentation() {
  if (KafkaInstrumentation) {
    return;
  }

  try {
    KafkaInstrumentation = require('@platformatic/kafka-opentelemetry').KafkaInstrumentation;
    isActive = true;
  } catch (e) {
    // optional dependency not installed
  }
}

module.exports.isActive = () => isActive;

module.exports.preInit = () => {
  initInstrumentation();
};

module.exports.init = () => {
  initInstrumentation();

  if (!KafkaInstrumentation) {
    return;
  }

  const instrumentation = new KafkaInstrumentation({});

  if (!instrumentation.getConfig().enabled) {
    instrumentation.enable();
  }
};

module.exports.getKind = otelSpan => {
  // @platformatic/kafka-opentelemetry uses 'process' for consumer spans
  if (otelSpan.attributes?.['messaging.operation.type'] === 'process') {
    return constants.ENTRY;
  }

  return constants.EXIT;
};

module.exports.setW3CTraceContext = setW3CTraceContext;
module.exports.extractW3CTraceContext = extractW3CTraceContext;
