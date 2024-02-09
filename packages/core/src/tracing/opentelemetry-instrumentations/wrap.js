/*
 * (c) Copyright IBM Corp. 2023
 */
// @ts-nocheck

'use strict';

const semver = require('semver');
const { AsyncHooksContextManager } = require('@opentelemetry/context-async-hooks');
const api = require('@opentelemetry/api');
const { BasicTracerProvider } = require('@opentelemetry/sdk-trace-base');
const constants = require('../constants');

// NOTE: Please refrain from utilizing third-party instrumentations.
//       Instead, opt for officially released instrumentations available in the OpenTelemetry
//       repository at https://github.com/open-telemetry/opentelemetry-js-contrib.
//       Third-party instrumentations typically bypass a review process,
//       resulting in suboptimal code coverage and potential vulnerabilities.
const instrumentations = {
  '@opentelemetry/instrumentation-fs': { name: 'fs' },
  '@opentelemetry/instrumentation-restify': { name: 'restify' },
  '@opentelemetry/instrumentation-socket.io': { name: 'socket.io' },
  '@opentelemetry/instrumentation-tedious': { name: 'tedious' }
};

module.exports.minimumNodeJsVersion = '14.0.0';

// NOTE: using a logger might create a recursive execution
//       logger.debug -> creates fs call -> calls transformToInstanaSpan -> calls logger.debug
//       use uninstrumented logger, but useless for production
module.exports.init = (_config, cls) => {
  // CASE: otel offically does not support Node < 14
  // https://github.com/open-telemetry/opentelemetry-js/tree/main#supported-runtimes
  if (semver.lt(process.versions.node, module.exports.minimumNodeJsVersion)) {
    return;
  }

  Object.keys(instrumentations).forEach(k => {
    const value = instrumentations[k];
    const instrumentation = require(`./${value.name}`);
    instrumentation.init(cls);
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
