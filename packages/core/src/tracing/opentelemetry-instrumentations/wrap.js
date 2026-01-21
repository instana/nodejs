/*
 * (c) Copyright IBM Corp. 2023
 */
// @ts-nocheck

'use strict';

const moduleLoadStart = Date.now();

const asyncHooksStart = Date.now();
const { AsyncHooksContextManager } = require('@opentelemetry/context-async-hooks');
// eslint-disable-next-line no-console
console.debug(`[PERF] [OTEL] [MODULE] @opentelemetry/context-async-hooks loaded in ${Date.now() - asyncHooksStart}ms`);

const coreStart = Date.now();
const { W3CTraceContextPropagator, hrTimeDuration, hrTimeToMilliseconds } = require('@opentelemetry/core');
// eslint-disable-next-line no-console
console.debug(`[PERF] [OTEL] [MODULE] @opentelemetry/core loaded in ${Date.now() - coreStart}ms`);

const apiStart = Date.now();
const api = require('@opentelemetry/api');
// eslint-disable-next-line no-console
console.debug(`[PERF] [OTEL] [MODULE] @opentelemetry/api loaded in ${Date.now() - apiStart}ms`);

const sdkStart = Date.now();
const { BasicTracerProvider } = require('@opentelemetry/sdk-trace-base');
// eslint-disable-next-line no-console
console.debug(`[PERF] [OTEL] [MODULE] @opentelemetry/sdk-trace-base loaded in ${Date.now() - sdkStart}ms`);

const utils = require('./utils');
const constants = require('../constants');
const supportedVersion = require('../supportedVersion');

// eslint-disable-next-line no-console
console.debug(`[PERF] [OTEL] [MODULE] Total module loading took ${Date.now() - moduleLoadStart}ms`);

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
  '@instana/instrumentation-confluent-kafka-javascript': { name: 'confluent-kafka' }
};

// NOTE: using a logger might create a recursive execution
//       logger.debug -> creates fs call -> calls transformToInstanaSpan -> calls logger.debug
//       use uninstrumented logger, but useless for production
module.exports.init = (_config, cls) => {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  const otelInitStart = Date.now();
  // eslint-disable-next-line no-console
  console.debug('[PERF] [OTEL] Starting OpenTelemetry instrumentations initialization');

  Object.keys(instrumentations).forEach(k => {
    const value = instrumentations[k];
    const instrStart = Date.now();

    try {
      const instrumentation = require(`./${value.name}`);
      const requireTime = Date.now() - instrStart;

      const initStart = Date.now();
      instrumentation.init({ cls, api: api });
      const initTime = Date.now() - initStart;

      value.module = instrumentation;

      const totalTime = Date.now() - instrStart;
      // eslint-disable-next-line no-console
      console.debug(
        `[PERF] [OTEL] ${k} (${value.name}): require=${requireTime}ms, init=${initTime}ms, total=${totalTime}ms`
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`[PERF] [OTEL] Failed to load ${k}:`, e.message);
    }
  });

  const prepareData = (otelSpan, instrumentation) => {
    const obj = {
      traceId: null,
      parentSpanId: null,
      kind: constants.EXIT,
      resource: { ...otelSpan.resource.attributes },
      tags: { ...otelSpan.attributes },
      instrumentation,
      operation: instrumentation.name,
      isSuppressed: cls.tracingSuppressed()
    };

    // NOTE: 'service.name' is "unknown" - probably because we don't setup otel completely.
    //       The removal fixes incorrect infrastructure correlation.
    delete obj.resource['service.name'];

    if (instrumentation.module.getKind) {
      obj.kind = instrumentation.module.getKind(otelSpan);
    }

    // CASE: instrumentations are allowed to manipulate the attributes to prepare our Instana span
    if (instrumentation.module.changeTags) {
      obj.tags = instrumentation.module.changeTags(otelSpan, obj.tags);
    }

    obj.tags = Object.assign({ name: otelSpan.name }, obj.tags);

    if (instrumentation.module.extractW3CTraceContext) {
      const w3cData = instrumentation.module.extractW3CTraceContext(obj, otelSpan);

      if (w3cData.traceId !== null) {
        obj.traceId = w3cData.traceId;
      }

      if (w3cData.parentSpanId !== null) {
        obj.parentSpanId = w3cData.parentSpanId;
      }
    }

    return obj;
  };

  const transformToInstanaSpan = (otelSpan, preparedData) => {
    if (preparedData.isSuppressed) {
      cls.setTracingLevel('0');
      return;
    }

    if (preparedData.kind === constants.EXIT && cls.skipExitTracing()) {
      return;
    }

    try {
      const createInstanaSpan = clsContext => {
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

        const origEnd = otelSpan.end;
        otelSpan.end = function instanaOnEnd() {
          const resp = origEnd.apply(this, arguments);

          if (otelSpan.duration) {
            instanaSpan.d = Math.round(hrTimeToMilliseconds(otelSpan.duration));
          } else if (otelSpan.startTime && otelSpan.endTime) {
            const durationHrTime = hrTimeDuration(otelSpan.startTime, otelSpan.endTime);
            instanaSpan.d = Math.round(hrTimeToMilliseconds(durationHrTime));
          }

          instanaSpan.transmit();

          if (clsContext) {
            cls.ns.exit(clsContext);
          }

          return resp;
        };

        return instanaSpan;
      };

      // NOTE: Create new context and inherit the parent context to keep the correlation.
      //       The whole flow is synchronous, no need to use runAndReturn async helper.
      const clsContext = cls.ns.createContext();
      cls.ns.enter(clsContext);

      const instanaSpan = createInstanaSpan(clsContext);
      return instanaSpan;
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
  const providerStart = Date.now();
  const provider = new BasicTracerProvider();
  // eslint-disable-next-line no-console
  console.debug(`[PERF] [OTEL] BasicTracerProvider creation took ${Date.now() - providerStart}ms`);

  const contextManagerStart = Date.now();
  const contextManager = new AsyncHooksContextManager();
  // eslint-disable-next-line no-console
  console.debug(`[PERF] [OTEL] AsyncHooksContextManager creation took ${Date.now() - contextManagerStart}ms`);

  const setupStart = Date.now();
  api.trace.setGlobalTracerProvider(provider);
  api.context.setGlobalContextManager(contextManager);
  // NOTE: Required for EXIT -> ENTRY (e.g. Kafka) correlation. W3CTraceContextPropagator will extract
  //       the w3c trace context from the incoming request and set it to the CLS context.
  api.propagation.setGlobalPropagator(new W3CTraceContextPropagator());
  // eslint-disable-next-line no-console
  console.debug(`[PERF] [OTEL] Global setup took ${Date.now() - setupStart}ms`);

  // eslint-disable-next-line no-console
  console.debug(`[PERF] [OTEL] Total OpenTelemetry init took ${Date.now() - otelInitStart}ms`);

  const orig = api.trace.setSpan;
  api.trace.setSpan = function instanaSetSpan(otelCtx, otelSpan) {
    // CASE: Otel reads incoming w3c trace context and the trace flag is set to NOT_RECORD (suppressed).
    //       We immediately suppress the trace for further sub spans and return the original context.
    const isSampled = utils.getSamplingDecision(otelSpan);

    if (!isSampled) {
      const clsContext = cls.ns.createContext();
      cls.ns.enter(clsContext);
      cls.setTracingLevel('0');
      const origEnd = otelSpan.end;
      otelSpan.end = function instanaOnEnd() {
        cls.ns.exit(clsContext);
        return origEnd.apply(this, arguments);
      };

      return orig.apply(this, arguments);
    }

    const instrumentationName = otelSpan.instrumentationScope?.name || otelSpan.instrumentationLibrary?.name;

    if (!instrumentationName) {
      return orig.apply(this, arguments);
    }

    const instrumentation = instrumentations[instrumentationName];

    // CASE: we don't support this instrumentation
    if (!instrumentation || !instrumentation.module) {
      return orig.apply(this, arguments);
    }

    const preparedData = prepareData(otelSpan, instrumentation);

    const instanaSpan = transformToInstanaSpan(otelSpan, preparedData);
    const originalCtx = orig.apply(this, arguments);

    if (otelSpan && instrumentation.module.setW3CTraceContext) {
      return instrumentation.module.setW3CTraceContext(api, preparedData, otelSpan, instanaSpan, originalCtx);
    }

    return originalCtx;
  };
};
