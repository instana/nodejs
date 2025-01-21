/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

// eslint-disable-next-line no-unused-vars
// @ts-ignore
module.exports.init = _config => {
  try {
    const instrumentationModules = _config.instrumentations;
    // @ts-ignore
    instrumentationModules.map(instrumentation => new instrumentation());
  } catch (e) {
    // ignore for now
  }
};
// TODO: Retrieve the OpenTelemetry trace and convert it into an Instana span.
// Create an Instana span for the current trace context.
// Perform parent span checks and handle tracing context accordingly.
