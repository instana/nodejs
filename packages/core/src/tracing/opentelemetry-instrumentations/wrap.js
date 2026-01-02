/*
 * (c) Copyright IBM Corp. 2023
 */
// @ts-nocheck

'use strict';

const { AsyncHooksContextManager } = require('@opentelemetry/context-async-hooks');
const { W3CTraceContextPropagator } = require('@opentelemetry/core');
const api = require('@opentelemetry/api');
const { BasicTracerProvider } = require('@opentelemetry/sdk-trace-base');
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
  '@opentelemetry/instrumentation-oracledb': { name: 'oracle' },
  '@drazke/instrumentation-confluent-kafka-javascript': { name: 'confluent-kafka' }
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

  const prepareData = (otelSpan, instrumentationModule, instrumentationName) => {
    const obj = {
      traceId: null,
      parentSpanId: null,
      kind: constants.EXIT,
      resource: { ...otelSpan.resource.attributes },
      tags: { ...otelSpan.attributes },
      // NOTE: opentelemetry/instrumentation-fs -> we only want the name behind instrumentation-
      operation: instrumentationName.split('-').pop()
    };

    // NOTE: 'service.name' is "unknown" - probably because we don't setup otel completely.
    //       The removal fixes incorrect infrastructure correlation.
    delete obj.resource['service.name'];

    if (instrumentationModule.getKind) {
      obj.kind = instrumentationModule.getKind(otelSpan);
    }

    // CASE: instrumentations are allowed to manipulate the attributes to prepare our Instana span
    if (instrumentationModule.changeTags) {
      obj.tags = instrumentationModule.changeTags(otelSpan, obj.tags);
    }

    obj.tags = Object.assign({ name: otelSpan.name }, obj.tags);

    if (instrumentationModule.getTraceId) {
      obj.traceId = instrumentationModule.getTraceId(obj.kind, otelSpan);
    }

    if (instrumentationModule.getParentId) {
      obj.parentSpanId = instrumentationModule.getParentId(obj.kind, otelSpan);
    }

    return obj;
  };

  const transformToInstanaSpan = (otelSpan, preparedData) => {
    if (cls.tracingSuppressed()) {
      return;
    }

    if (preparedData.kind === constants.EXIT && cls.skipExitTracing()) {
      return;
    }

    try {
      const createInstanaSpan = onEndCallback => {
        const spanAttributes = preparedData.traceId
          ? {
              spanName: 'otel',
              kind: preparedData.kind,
              traceId: preparedData.traceId,
              parentSpanId: preparedData.parentSpanId
            }
          : {
              spanName: 'otel',
              kind: preparedData.kind
            };

        const instanaSpan = cls.startSpan(spanAttributes);

        instanaSpan.data = {
          // span.data.operation is mapped to endpoint for otel span plugin in BE.
          // We need to set the endpoint otherwise the ui will show unspecified
          operation: preparedData.operation,
          tags: preparedData.tags,
          resource: preparedData.resource
        };

        otelSpan._instanaSpan = instanaSpan;

        const origEnd = otelSpan.end;
        otelSpan.end = function instanaOnEnd() {
          instanaSpan.transmit();
          if (onEndCallback) {
            onEndCallback();
          }
          return origEnd.apply(this, arguments);
        };
      };

      if (preparedData.kind === constants.ENTRY) {
        const clsContext = cls.ns.createContext();
        cls.ns.enter(clsContext);

        createInstanaSpan(() => {
          cls.ns.exit(clsContext);
        });
      } else {
        cls.ns.runAndReturn(() => createInstanaSpan());
      }
    } catch (e) {
      // ignore for now
    }
  };

  /**
   * OpenTelemetry initializes with a ProxyTracerProvider as the default global tracer provider
   * when no actual provider has been registered yet. Initially, all tracer requests are routed
   * through this proxy until a concrete TracerProvider (e.g., BasicTracerProvider or NodeTracerProvider) is registered.
   *
   * The OTEL API implementation ensures that if a concrete TracerProvider has already been registered and delegated,
   * subsequent calls to set the global provider(setGlobalTracerProvider) are ignored. This prevents
   * accidental configuration overrides and maintains telemetry consistency.
   *
   * Therefore, setGlobalTracerProvider will only register our provider(BasicTracerProvider) if none is currently set.
   * (Handled internally by the OTEL API — see:
   * https://github.com/open-telemetry/opentelemetry-js/blob/main/api/src/internal/global-utils.ts#L37)
   *
   * The same approach applies to the global context manager.
   *
   */
  const provider = new BasicTracerProvider();
  const contextManager = new AsyncHooksContextManager();

  api.trace.setGlobalTracerProvider(provider);
  api.context.setGlobalContextManager(contextManager);
  // NOTE: Required for EXIT -> ENTRY (e.g. Kafka) correlation
  api.propagation.setGlobalPropagator(new W3CTraceContextPropagator());

  const orig = api.trace.setSpan;
  api.trace.setSpan = function instanaSetSpan(otelCtx, otelSpan) {
    // TODO: remove instrumentationLibrary in next major release
    //       instrumentationScope was introduced in OpenTelemetry v2
    if (!otelSpan.instrumentationScope && !otelSpan.instrumentationLibrary) {
      return orig.apply(this, arguments);
    }

    const instrumentationName = otelSpan.instrumentationScope?.name || otelSpan.instrumentationLibrary?.name;

    if (!instrumentationName) {
      return orig.apply(this, arguments);
    }

    const instrumentationModule = instrumentations[instrumentationName]?.module;

    // CASE: we don't support this instrumentation
    if (!instrumentationModule) {
      return orig.apply(this, arguments);
    }

    const preparedData = prepareData(otelSpan, instrumentationModule, instrumentationName);

    transformToInstanaSpan(otelSpan, preparedData);
    const originalCtx = orig.apply(this, arguments);

    if (otelSpan && otelSpan._instanaSpan) {
      if (instrumentationModule.manipulateOtelSpan && preparedData.kind === constants.EXIT) {
        return instrumentationModule.manipulateOtelSpan(api, otelSpan, otelSpan._instanaSpan, originalCtx);
      }
    }

    return originalCtx;
  };
};
