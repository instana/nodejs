/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2019
 */

'use strict';

const deepMerge = require('../../util/deepMerge');
const tracingUtil = require('../tracingUtil');
const constants = require('../constants');

let logger;
logger = require('../../logger').getLogger('tracing/sdk', newLogger => {
  logger = newLogger;
});

let isActive = false;

module.exports = exports = function(isCallbackApi) {
  let cls = null;
  let wrapper = null;

  function startEntrySpan(name, tags, traceId, parentSpanId, callback) {
    if (isCallbackApi && arguments.length === 2 && typeof arguments[1] === 'function') {
      callback = tags;
      tags = traceId = parentSpanId = null;
    } else if (isCallbackApi && arguments.length === 3 && typeof arguments[2] === 'function') {
      callback = traceId;
      traceId = parentSpanId = null;
    }

    if (!isActive) {
      return callNext(callback);
    }

    const parentSpan = cls.getCurrentSpan();
    if (parentSpan) {
      logger.warn(
        // eslint-disable-next-line max-len
        `Cannot start an entry span (${name}) when another span is already active. Currently, the following span is active: ${JSON.stringify(
          parentSpan
        )}`
      );
      return callNext(callback);
    }

    return startSdkSpan(
      name,
      constants.ENTRY,
      constants.SDK.ENTRY,
      startEntrySpan,
      tags,
      traceId,
      parentSpanId,
      callback
    );
  }

  function completeEntrySpan(error, tags) {
    if (!isActive) {
      return;
    }

    const span = cls.getCurrentSpan();

    if (!span) {
      logger.warn(
        // eslint-disable-next-line max-len
        'Cannot complete an entry span as this requires an entry span to be currently active. Currently there is no span active at all.'
      );
      return;
    }
    if (!constants.isEntrySpan(span)) {
      logger.warn(
        // eslint-disable-next-line max-len
        `Cannot complete an entry span as this requires an entry span to be currently active. But the currently active span is not an entry span: ${JSON.stringify(
          span
        )}`
      );
      return;
    }

    completeSpan(error, span, tags);
  }

  function startIntermediateSpan(name, tags, callback) {
    if (isCallbackApi && arguments.length === 2 && typeof arguments[1] === 'function') {
      callback = tags;
      tags = null;
    }

    if (!isActive) {
      return callNext(callback);
    }

    const parentSpan = cls.getCurrentSpan();

    if (!parentSpan) {
      logger.warn(
        // eslint-disable-next-line max-len
        `Cannot start an intermediate span (${name}) as this requires an active entry (or intermediate) span as parent. Currently there is no span active at all.`
      );
      return callNext(callback);
    }
    if (constants.isExitSpan(parentSpan)) {
      logger.warn(
        // eslint-disable-next-line max-len
        `Cannot start an intermediate span (${name}) as this requires an active entry (or intermediate) span as parent. But the currently active span is an exit span: ${JSON.stringify(
          parentSpan
        )}`
      );
      return callNext(callback);
    }

    return startSdkSpan(
      name,
      constants.INTERMEDIATE,
      constants.SDK.INTERMEDIATE,
      startIntermediateSpan,
      tags,
      null,
      null,
      callback
    );
  }

  function completeIntermediateSpan(error, tags) {
    if (!isActive) {
      return;
    }

    const span = cls.getCurrentSpan();

    if (!span) {
      logger.warn(
        // eslint-disable-next-line max-len
        'Cannot complete an intermediate span as this requires an intermediate span to be currently active. Currently there is no span active at all.'
      );
      return;
    }
    if (!constants.isIntermediateSpan(span)) {
      logger.warn(
        // eslint-disable-next-line max-len
        `Cannot complete an intermediate span as this requires an intermediate span to be currently active. But the currently active span is not an intermediate span: ${JSON.stringify(
          span
        )}`
      );
      return;
    }

    completeSpan(error, span, tags);
  }

  function startExitSpan(name, tags, callback) {
    if (isCallbackApi && arguments.length === 2 && typeof arguments[1] === 'function') {
      callback = tags;
      tags = null;
    }

    if (!isActive) {
      return callNext(callback);
    }

    const parentSpan = cls.getCurrentSpan();

    if (!parentSpan) {
      logger.warn(
        // eslint-disable-next-line max-len
        `Cannot start an exit span (${name}) as this requires an active entry (or intermediate) span as parent. Currently there is no span active at all.`
      );
      return callNext(callback);
    }
    if (constants.isExitSpan(parentSpan)) {
      logger.warn(
        // eslint-disable-next-line max-len
        `Cannot start an exit span (${name}) as this requires an active entry (or intermediate) span as parent. But the currently active span is itself an exit span: ${JSON.stringify(
          parentSpan
        )}`
      );
      return callNext(callback);
    }

    return startSdkSpan(name, constants.EXIT, constants.SDK.EXIT, startExitSpan, tags, null, null, callback);
  }

  function completeExitSpan(error, tags) {
    if (!isActive) {
      return;
    }

    const span = cls.getCurrentSpan();

    if (!span) {
      logger.warn(
        // eslint-disable-next-line max-len
        'Cannot complete an exit span as this requires an exit span to be currently active. Currently there is no span active at all.'
      );
      return;
    }
    if (!constants.isExitSpan(span)) {
      logger.warn(
        // eslint-disable-next-line max-len
        `Cannot complete an exit span as this requires an exit span to be currently active. But the currently active span is not an exit span: ${JSON.stringify(
          span
        )}`
      );
      return;
    }

    completeSpan(error, span, tags);
  }

  function startSdkSpan(name, kind, sdkKind, stackTraceRef, tags, traceId, parentSpanId, callback) {
    return wrapper(() => {
      const span = cls.startSpan('sdk', kind, traceId, parentSpanId);
      span.stack = tracingUtil.getStackTrace(stackTraceRef);
      span.data.sdk = {
        name,
        type: sdkKind
      };
      if (tags) {
        span.data.sdk.custom = { tags };
      }
      return callNext(callback);
    });
  }

  function completeSpan(error, span, tags) {
    if (!span.data.sdk) {
      logger.warn(
        // eslint-disable-next-line max-len
        `Cannot complete an SDK span. The currently active span is not an SDK span, so there seems to be a mismatch in the trace context. This is the currently active span: ${JSON.stringify(
          span
        )}`
      );
      return;
    }

    if (error) {
      span.ec = 1;
      if (!span.data.sdk.custom) {
        span.data.sdk.custom = {
          tags: {}
        };
      }
      if (!span.data.sdk.custom.tags) {
        span.data.sdk.custom.tags = {};
      }
      if (span.data.sdk.custom.tags.message == null) {
        span.data.sdk.custom.tags.message = tracingUtil.getErrorDetails(error);
      }
    }

    if (span.data.sdk.custom && tags) {
      span.data.sdk.custom.tags = deepMerge(span.data.sdk.custom.tags, tags);
    } else if (tags) {
      span.data.sdk.custom = { tags };
    }

    span.d = Date.now() - span.ts;
    span.transmit();
  }

  function bindEmitter(emitter) {
    if (isActive) {
      cls.ns.bindEmitter(emitter);
    }
  }

  function callNext(callback) {
    return isCallbackApi ? callback() : Promise.resolve();
  }

  function init(_cls) {
    cls = _cls;
    wrapper = isCallbackApi ? cls.ns.runAndReturn.bind(cls.ns) : cls.ns.runPromise.bind(cls.ns);
  }

  function activate() {
    isActive = true;
  }

  function deactivate() {
    isActive = true;
  }

  return {
    startEntrySpan,
    completeEntrySpan,
    startIntermediateSpan,
    completeIntermediateSpan,
    startExitSpan,
    completeExitSpan,
    bindEmitter,
    init,
    activate,
    deactivate
  };
};
