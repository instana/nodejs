/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

/* eslint-disable instana/no-unsafe-require */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-console */
// const { NodeSDK } = require('@opentelemetry/sdk-node');
// const { ConsoleSpanExporter } = require('@opentelemetry/sdk-trace-node');
// const { FsInstrumentation } = require('@opentelemetry/instrumentation-fs');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
// const { AsyncHooksContextManager } = require('@opentelemetry/context-async-hooks');
// const api = require('@opentelemetry/api');
// const { BasicTracerProvider } = require('@opentelemetry/sdk-trace-base');

// eslint-disable-next-line no-unused-vars
// @ts-ignore
module.exports.init = _config => {
  // const provider = new BasicTracerProvider();
  // const contextManager = new AsyncHooksContextManager();
  // api.trace.setGlobalTracerProvider(provider);
  // api.context.setGlobalContextManager(contextManager);
  const instrumentationModules = _config.instrumentation;
  // // @ts-ignore
  const instrumentations = instrumentationModules.map(module => new module());
  // const sdk = new NodeSDK({
  //   traceExporter: new ConsoleSpanExporter(),
  //   instrumentations: instrumentations
  // });
  // sdk.start();
  const provider = new NodeTracerProvider();
  provider.register();

  registerInstrumentations({
    instrumentations: [instrumentations]
  });
};
// TODO: Retrieve the OpenTelemetry trace and convert it into an Instana span.
// Create an Instana span for the current trace context.
// Perform parent span checks and handle tracing context accordingly.
