/*
 * (c) Copyright IBM Corp. 2023
 */
// @ts-nocheck

'use strict';

const { AsyncHooksContextManager } = require('@opentelemetry/context-async-hooks');
const { BasicTracerProvider } = require('@opentelemetry/sdk-trace-base');
const apiResolver = require('../../util/opentelemetryApiResolver');
const constants = require('../constants');
const supportedVersion = require('../supportedVersion');

// NOTE: Please refrain from utilizing third-party instrumentations.
//       Instead, opt for officially released instrumentations available in the OpenTelemetry
//       repository at https://github.com/open-telemetry/opentelemetry-js-contrib.
//       Third-party instrumentations typically bypass a review process,
//       resulting in suboptimal code coverage and potential vulnerabilities.
const instrumentations = {
  '@opentelemetry/instrumentation-fs': { name: 'fs' },
  '@opentelemetry/instrumentation-restify': { name: 'restify' },
  '@opentelemetry/instrumentation-socket.io': { name: 'socket.io' },
  '@opentelemetry/instrumentation-tedious': { name: 'tedious' },
  '@opentelemetry/instrumentation-oracledb': { name: 'oracle' }
};

// Store API instances for each instrumentation
const apiInstances = {};

// NOTE: using a logger might create a recursive execution
//       logger.debug -> creates fs call -> calls transformToInstanaSpan -> calls logger.debug
//       use uninstrumented logger, but useless for production
module.exports.init = (_config, cls) => {
  if (!supportedVersion(process.versions.node)) {
    return;
  }
  // For each instrumentation, retrieve its corresponding @opentelemetry/api instance
  // using the apiResolver and store it in apiInstances.
  // This ensures that we have an API instance available for every instrumentation.
  Object.keys(instrumentations).forEach(instrumentationName => {
    apiInstances[instrumentationName] = apiResolver.getApiForInstrumentation(instrumentationName);
  });

  Object.keys(instrumentations).forEach(k => {
    const value = instrumentations[k];
    const instrumentation = require(`./${value.name}`);
    instrumentation.init({ cls: cls, api: apiInstances[k] });
    value.module = instrumentation;
  });

  const transformToInstanaSpan = otelSpan => {
    if (!otelSpan || !otelSpan.instrumentationLibrary) {
      return;
    }

    const targetInstrumentionName = otelSpan.instrumentationLibrary.name;
    let kind = constants.EXIT;

    if (instrumentations[targetInstrumentionName] && instrumentations[targetInstrumentionName].module) {
      const targetInstrumentationModule = instrumentations[targetInstrumentionName].module;

      if (targetInstrumentationModule.getKind) {
        kind = targetInstrumentationModule.getKind(otelSpan);
      }

      if (targetInstrumentationModule.transform) {
        otelSpan = targetInstrumentationModule.transform(otelSpan);
      }
    } else {
      // CASE: A customer has installed an Opentelemetry instrumentation, but
      //       we do not want to capture these spans. We only support our own set of modules.
      return;
    }

    if (cls.tracingSuppressed()) {
      return;
    }

    if (kind === constants.EXIT && cls.skipExitTracing()) {
      return;
    }

    try {
      cls.ns.runAndReturn(() => {
        const instanaSpan = cls.startSpan({
          spanName: 'otel',
          kind: kind
        });
        instanaSpan.data = {
          tags: Object.assign({ name: otelSpan.name }, otelSpan.attributes),
          resource: otelSpan.resource.attributes
        };

        const origEnd = otelSpan.end;
        otelSpan.end = function instanaOnEnd() {
          instanaSpan.transmit();
          return origEnd.apply(this, arguments);
        };
      });
    } catch (e) {
      // ignore for now
    }
  };

  // Each instrumentation depends on @opentelemetry/instrumentation,
  // which has a peer dependency on @opentelemetry/api.
  // An API instance is created for each instrumentation, but multiple instrumentations
  // may share the same underlying API instance. To avoid initializing the same API instance multiple times,
  // we ensure that each unique @opentelemetry/api instance is initialized only once.
  // This approach:
  //   * Prevents duplicate apiInstance initializations
  //   * Ensures that span transformations are applied correctly
  const allApiInstances = Object.values(apiInstances);
  const uniqueApis = [...new Set(allApiInstances)];

  uniqueApis.forEach(api => {
    const provider = new BasicTracerProvider();
    const contextManager = new AsyncHooksContextManager();

    api.trace.setGlobalTracerProvider(provider);
    api.context.setGlobalContextManager(contextManager);

    const originalSetSpan = api.trace.setSpan;
    api.trace.setSpan = function instanaSetSpan(ctx, span) {
      transformToInstanaSpan(span);
      return originalSetSpan.apply(this, arguments);
    };
  });
};
