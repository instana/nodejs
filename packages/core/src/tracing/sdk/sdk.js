/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const deepMerge = require('../../util/deepMerge');
const tracingUtil = require('../tracingUtil');
const constants = require('../constants');

/** @typedef {import('../../core').InstanaBaseSpan} InstanaBaseSpan */

let isActive = false;

/**
 * @param {boolean} isCallbackApi
 */
exports.generate = function (isCallbackApi) {
  /** @type {import('../../core').GenericLogger} */
  let logger;
  /** @type {import('../cls')} */
  let cls = null;
  /** @type {Function} */
  let runInContext = null;

  /**
   * Suppression for SDK entry spans do not have a use case right now.
   *
   * The known use case for SDK entry spans are:
   *   - receive a message from any external source (which is not traced e.g. IPC)
   *     and you start a span for that.
   *   - a worker who executes a task in a loop and you want to trace the task.
   *
   * Sampling could be added for SDK entry spans in the future.
   *
   * @param {string} name
   * @param {Object.<string, *> | Function} tags
   * @param {Object.<string, *> | Function | string} traceId
   * @param {string} parentSpanId
   * @param {Function | Object.<string, *>} callback
   */
  function startEntrySpan(name, tags, traceId, parentSpanId, callback) {
    if (isCallbackApi && arguments.length === 2 && typeof arguments[1] === 'function') {
      callback = tags;
      tags = traceId = parentSpanId = null;
    } else if (isCallbackApi && arguments.length === 3 && typeof arguments[2] === 'function') {
      callback = /** @type {Function} */ (traceId);
      traceId = parentSpanId = null;
    }

    if (!isActive) {
      return callNext(/** @type {Function} */ (callback));
    }

    const parentSpan = cls.getCurrentSpan();
    if (parentSpan) {
      logger.warn(
        // eslint-disable-next-line max-len
        `Cannot start an entry span (${name}) when another span is already active. Currently, the following span is active: ${JSON.stringify(
          parentSpan
        )}`
      );
      return callNext(/** @type {Function} */ (callback));
    }

    return startSdkSpan(
      name,
      constants.ENTRY,
      constants.SDK.ENTRY,
      true,
      startEntrySpan,
      /** @type {Object.<string, *> | null} */ (tags),
      /** @type {string} */ (traceId),
      parentSpanId,
      /** @type {Function} */ (callback)
    );
  }

  /**
   * @param {Error} error
   * @param {Object.<string, *>} tags
   */
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

  /**
   * @param {string} name
   * @param {Object.<string, *>} tags
   * @param {Function | Object.<string, *>} callback
   * @returns {Function | Promise<*>}
   */
  function startIntermediateSpan(name, tags, callback) {
    if (isCallbackApi && arguments.length === 2 && typeof arguments[1] === 'function') {
      callback = tags;
      tags = null;
    }

    if (!isActive) {
      return callNext(/** @type {Function} */ (callback));
    }

    const parentSpan = cls.getCurrentSpan();

    if (!parentSpan) {
      logger.warn(
        // eslint-disable-next-line max-len
        `Cannot start an intermediate span (${name}) as this requires an active entry (or intermediate) span as parent. Currently there is no span active at all.`
      );
      return callNext(/** @type {Function} */ (callback));
    }

    if (constants.isExitSpan(parentSpan)) {
      logger.warn(
        // eslint-disable-next-line max-len
        `Cannot start an intermediate span (${name}) as this requires an active entry (or intermediate) span as parent. But the currently active span is an exit span: ${JSON.stringify(
          parentSpan
        )}`
      );
      return callNext(/** @type {Function} */ (callback));
    }

    return startSdkSpan(
      name,
      constants.INTERMEDIATE,
      constants.SDK.INTERMEDIATE,
      false,
      startIntermediateSpan,
      tags,
      null,
      null,
      /** @type {Function} */ (callback)
    );
  }

  /**
   * @param {Error} error
   * @param {Object.<string, *>} tags
   * @param {InstanaBaseSpan} spanToBeCompleted
   */
  function completeIntermediateSpan(error, tags, spanToBeCompleted) {
    if (!isActive) {
      return;
    }

    const span = spanToBeCompleted || cls.getCurrentSpan();

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

  /**
   * @param {string} name
   * @param {Object.<string, *>} tags
   * @param {Function | Object.<string, *>} callback
   * @returns {Function | Promise<*>}
   */
  function startExitSpan(name, tags, callback) {
    if (isCallbackApi && arguments.length === 2 && typeof arguments[1] === 'function') {
      callback = tags;
      tags = null;
    }

    if (cls === null) {
      return callNext(/** @type {Function} */ (callback));
    }

    if (cls.skipExitTracing({ isActive })) {
      return callNext(/** @type {Function} */ (callback));
    }

    return startSdkSpan(
      name,
      constants.EXIT,
      constants.SDK.EXIT,
      false,
      startExitSpan,
      tags,
      null,
      null,
      /** @type {Function} */ (callback)
    );
  }

  /**
   * @param {Error} error
   * @param {Object.<string, *>} tags
   */
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

  /**
   * @param {string} name
   * @param {number} kind
   * @param {string} sdkKind
   * @param {boolean} forceRootContext
   * @param {Function} stackTraceRef
   * @param {Object.<string, *>} tags
   * @param {string} traceId
   * @param {string} parentSpanId
   * @param {Function} callback
   * @returns {Function | Promise<*>}
   */
  function startSdkSpan(name, kind, sdkKind, forceRootContext, stackTraceRef, tags, traceId, parentSpanId, callback) {
    const context = forceRootContext
      ? // SDK entry spans: Force ALS/CLS to use a new, separate root context. There is nothing we ever want to fetch
        // from a parent/ancestor context for SDK entry spans. This avoids a memory leak when client code is calling
        // sdk.startEntrySpan recursively in the same context over and over again, which creates an evergrowing chain
        // of contexts, linked by prototypical inheritance.
        cls.ns.createRootContext()
      : // Let ALS/CLS create a new child context of the currently active context. This is the correct behavior for
        // intermediate and exit spans. We need them to happen in a child/descendant context of the currently active
        // entry span.
        null;

    return runInContext(() => {
      const span = cls.startSpan({
        spanName: 'sdk',
        kind: kind,
        traceId: traceId,
        parentSpanId: parentSpanId
      });
      span.stack = tracingUtil.getStackTrace(stackTraceRef);
      span.data.sdk = {
        name,
        type: sdkKind
      };
      if (tags) {
        // We make a copy of the tags object to assure that it is extensible.
        // As the tags object is provided by users, they could have been made not extensible with
        // Object.freeze or Object.preventExtensions
        span.data.sdk.custom = { tags: Object.assign({}, tags) };
      }
      return callNext(callback);

      // The additional argument `context` for runInContext (cls.ns.runAndReturn or cls.ns.runPromise, depending on the
      // API type) allows us to force a specific context to be used by those functions. We use a new root context for
      // SDK entry spans and null otherwise (intermediate spans, exit spans).
    }, context);
  }

  /**
   * @param {Error} error
   * @param {import('../../core').InstanaBaseSpan} span
   * @param {Object.<string, *>} tags
   */
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
        // TODO: fix sdk error capture and handling
        // This fn used getErrorDetails for now and will need to change
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

  /**
   * @param {import('events').EventEmitter} emitter
   */
  function bindEmitter(emitter) {
    if (isActive) {
      cls.ns.bindEmitter(emitter);
    }
  }

  /**
   * @param {Function} callback
   * @returns {Function | Promise<*>}
   */
  function callNext(callback) {
    const span = cls ? cls.getCurrentSpan() : null;
    return isCallbackApi ? callback(span) : Promise.resolve(span);
  }

  /**
   * @param {import('../../config').InstanaConfig} config
   * @param {import('../cls')} _cls
   */
  function init(config, _cls) {
    logger = config.logger;
    cls = _cls;
    runInContext = isCallbackApi ? cls.ns.runAndReturn.bind(cls.ns) : cls.ns.runPromise.bind(cls.ns);
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
