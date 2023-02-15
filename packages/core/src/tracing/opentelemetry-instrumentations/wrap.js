/*
 * (c) Copyright IBM Corp. 2023
 */
// @ts-nocheck

'use strict';

const { AsyncHooksContextManager } = require('@opentelemetry/context-async-hooks');
const api = require('@opentelemetry/api');
const { BasicTracerProvider } = require('@opentelemetry/sdk-trace-base');
const constants = require('../constants');
const instrumentations = {
  '@opentelemetry/instrumentation-fs': { name: 'fs' },
  '@opentelemetry/instrumentation-restify': { name: 'restify' },
  '@opentelemetry/instrumentation-socket.io': { name: 'socket.io' }
};

// NOTE: using a logger might create a recursive execution
//       logger.debug -> creates fs call -> calls transformToInstanaSpan -> calls logger.debug
//       use uninstrumented logger, but useless for production
module.exports.init = (_config, cls) => {
  Object.keys(instrumentations).forEach(k => {
    const value = instrumentations[k];
    const instrumentation = require(`./${value.name}`);
    instrumentation.init(cls);
    value.module = instrumentation;
  });

  const transformToInstanaSpan = otelSpan => {
    const tracingSuppressed = cls.tracingSuppressed();
    if (tracingSuppressed) {
      return;
    }

    const targetInstrumentionName = otelSpan.instrumentationLibrary.name;
    let kind = constants.EXIT;

    if (instrumentations[targetInstrumentionName] && instrumentations[targetInstrumentionName].module) {
      const m = instrumentations[targetInstrumentionName].module;

      if (m.getKind) {
        kind = m.getKind(otelSpan);
      }

      if (m.transform) {
        otelSpan = m.transform(otelSpan);
      }
    }

    try {
      cls.ns.runAndReturn(() => {
        const instanaSpan = cls.startSpan('otel', kind);
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

  const provider = new BasicTracerProvider();
  api.trace.setGlobalTracerProvider(provider);
  api.context.setGlobalContextManager(new AsyncHooksContextManager());

  const orig = api.trace.setSpan;
  api.trace.setSpan = function instanaSetSpan(ctx, span) {
    transformToInstanaSpan(span);
    return orig.apply(this, arguments);
  };
};
