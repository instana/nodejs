/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

// Note This logic can be included in wrap.js
// For easy testing added this file
// eslint-disable-next-line no-unused-vars
const { AsyncHooksContextManager } = require('@opentelemetry/context-async-hooks');
const api = require('@opentelemetry/api');
const { BasicTracerProvider } = require('@opentelemetry/sdk-trace-base');
// @ts-ignore
module.exports.init = _config => {
  try {
    const instrumentationModules = _config.instrumentations;
    // TODO: we need to forcefully reload the package here
    // Object.keys(require.cache).forEach(key => {
    //   if (key.includes('node_modules/@opentelemetry/instrumentation-')) {
    //     delete require.cache[key];
    //   }
    // });
    // @ts-ignore
    instrumentationModules.map(instrumentation => new instrumentation());

    const provider = new BasicTracerProvider();
    const contextManager = new AsyncHooksContextManager();

    api.trace.setGlobalTracerProvider(provider);
    api.context.setGlobalContextManager(contextManager);
    const orig = api.trace.setSpan;
    api.trace.setSpan = function instanaSetSpan(ctx, span) {
      // eslint-disable-next-line no-console
      console.log('------------span--------------------', span); // Currently not receiving any span
      // transformToInstanaSpan(span);  // TODO
      return orig.apply(this, arguments);
    };
  } catch (e) {
    // ignore for now
  }
};
// TODO: Retrieve the OpenTelemetry trace and convert it into an Instana span.
// Create an Instana span for the current trace context.
// Perform parent span checks and handle tracing context accordingly.
