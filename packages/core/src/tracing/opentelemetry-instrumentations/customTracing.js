/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

/* eslint-disable instana/no-unsafe-require */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-console */
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

// eslint-disable-next-line no-unused-vars
// @ts-ignore
module.exports.init = _config => {
  const instrumentationModules = _config.instrumentation;
  // @ts-ignore
  const instrumentations = instrumentationModules.map(module => new module());
  const provider = new NodeTracerProvider();
  provider.register();

  registerInstrumentations({
    instrumentations: [instrumentations]
  });
};
// TODO: Retrieve the OpenTelemetry trace and convert it into an Instana span.
// Create an Instana span for the current trace context.
// Perform parent span checks and handle tracing context accordingly.
