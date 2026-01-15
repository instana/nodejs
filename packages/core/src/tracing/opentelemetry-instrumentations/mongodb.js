/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

module.exports.init = () => {
  const { MongoDBInstrumentation } = require('@opentelemetry/instrumentation-mongodb');

  const instrumentation = new MongoDBInstrumentation();

  if (!instrumentation.getConfig().enabled) {
    instrumentation.enable();
  }
};
