/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

// NOTE: otel fs instrumentation does not capture the file name currently
module.exports.init = ({ cls, api }) => {
  const initStart = Date.now();

  const constantsStart = Date.now();
  const constants = require('../constants');
  // eslint-disable-next-line no-console
  console.debug(`[PERF] [OTEL] [FS] constants require: ${Date.now() - constantsStart}ms`);

  const nonRecordingStart = Date.now();
  const { NonRecordingSpan } = require('./files/NonRecordingSpan');
  // eslint-disable-next-line no-console
  console.debug(`[PERF] [OTEL] [FS] NonRecordingSpan require: ${Date.now() - nonRecordingStart}ms`);

  const fsInstrStart = Date.now();
  const { FsInstrumentation } = require('@opentelemetry/instrumentation-fs');
  // eslint-disable-next-line no-console
  console.debug(`[PERF] [OTEL] [FS] FsInstrumentation require: ${Date.now() - fsInstrStart}ms`);

  // eslint-disable-next-line max-len
  // https://github.com/open-telemetry/opentelemetry-js-contrib/pull/1335/files#diff-9a2f445c78d964623d07987299501cbc3101cbe0f76f9e18d2d75787601539daR428
  // As we mix Instana & Otel instrumentations, we need to check here if
  // we have an Instana parentSpan otherwise we loose spans.
  // e.g. http server call is instana span && fs call exit call is otel span
  const orig = api.trace.getSpan;
  api.trace.getSpan = function instanaGetSpan() {
    const parentSpan = cls.getCurrentSpan();

    // CASE: we only want to trace fs calls on entry spans
    if (!parentSpan || constants.isExitSpan(parentSpan)) {
      return orig.apply(this, arguments);
    }

    // We tell Otel that there is a fake parent span
    return new NonRecordingSpan();
  };

  const createInstrStart = Date.now();
  const instrumentation = new FsInstrumentation({
    // NOTE: we have to use requireParentSpan otherwise we would create spans on bootstrap for all require statements
    requireParentSpan: true,
    createHook: (operation, opts) => {
      // CASE: we ignore lazy loading of npm modules,
      // because this can create a lot of require calls e.g. fs-extra creates > 500 calls
      // NOTE: createHook is called **after** requireParentSpan
      if (opts.args && opts.args[0] && opts.args[0].indexOf('/node_modules') !== -1) return false;
      return true;
    }
  });
  // eslint-disable-next-line no-console
  console.debug(`[PERF] [OTEL] [FS] FsInstrumentation creation: ${Date.now() - createInstrStart}ms`);

  const enableStart = Date.now();
  if (!instrumentation.getConfig().enabled) {
    instrumentation.enable();
  }
  // eslint-disable-next-line no-console
  console.debug(`[PERF] [OTEL] [FS] enable: ${Date.now() - enableStart}ms`);

  // eslint-disable-next-line no-console
  console.debug(`[PERF] [OTEL] [FS] TOTAL init: ${Date.now() - initStart}ms`);
};
