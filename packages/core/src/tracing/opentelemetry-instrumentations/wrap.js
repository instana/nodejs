/*
 * (c) Copyright IBM Corp. 2023
 */
// @ts-nocheck

'use strict';

const { AsyncHooksContextManager } = require('@opentelemetry/context-async-hooks');
const { BasicTracerProvider } = require('@opentelemetry/sdk-trace-base');
const constants = require('../constants');
const supportedVersion = require('../supportedVersion');
const api = require('./opentelemetryApi');

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

// NOTE: using a logger might create a recursive execution
//       logger.debug -> creates fs call -> calls transformToInstanaSpan -> calls logger.debug
//       use uninstrumented logger, but useless for production
module.exports.init = (_config, cls) => {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  Object.keys(instrumentations).forEach(k => {
    const value = instrumentations[k];
    const instrumentation = require(`./${value.name}`);
    instrumentation.init({ cls, api: api });
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

  /**
   * OpenTelemetry uses a ProxyTracerProvider as the default global tracer provider
   * when no real tracer provider has been registered yet.
   *
   * This means initially, any tracer requests go through a proxy until a concrete
   * TracerProvider (like BasicTracerProvider or NodeTracerProvider) is registered.
   *
   * Only if no provider is already registered, we create and register our own
   * BasicTracerProvider instance. This ensures OpenTelemetry has a proper, configured
   * tracer provider to create and manage traces.
   *
   * Note:
   * If a global tracer provider is already set, calling
   * api.trace.setGlobalTracerProvider() again will be ignored to prevent accidentally overriding
   * an existing and functioning configuration. This acts as a safeguard to maintain telemetry consistency.
   *
   * Similar behavior applies to the global context manager.
   *
   * Reference:
   * https://github.com/open-telemetry/opentelemetry-js/blob/main/api/src/internal/global-utils.ts#L37
   */

  const provider = new BasicTracerProvider();
  api.trace.setGlobalTracerProvider(provider);

  const contextManager = new AsyncHooksContextManager();
  contextManager.enable();
  api.context.setGlobalContextManager(contextManager);

  const orig = api.trace.setSpan;
  api.trace.setSpan = function instanaSetSpan(ctx, span) {
    transformToInstanaSpan(span);
    return orig.apply(this, arguments);
  };
};
