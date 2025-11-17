/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

// NOTE: otel fs instrumentation does not capture the file name currently
module.exports.init = ({ cls, api }) => {
  const constants = require('../constants');
  const { NonRecordingSpan } = require('./files/NonRecordingSpan');
  const { FsInstrumentation } = require('@opentelemetry/instrumentation-fs');

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

  if (!instrumentation.getConfig().enabled) {
    instrumentation.enable();
  }
};

exports.transform = otelSpan => {
  // NOTE: This assignment is necessary to display the service name correlation in the UI.
  // We inherit the service name from the parent Instana span's service name if available.
  const cls = require('../cls');
  const parentSpan = cls.getCurrentSpan();

  if (parentSpan && parentSpan.data && parentSpan.data.service) {
    otelSpan.resource._attributes['service.name'] = parentSpan.data.service;
  } else {
    // Fallback to a contsant for now.
    // This logic needs to be updated
    otelSpan.resource._attributes['service.name'] = 'fs';
  }
  return otelSpan;
};

module.exports.getKind = () => {
  const constants = require('../constants');
  return constants.EXIT;
};
