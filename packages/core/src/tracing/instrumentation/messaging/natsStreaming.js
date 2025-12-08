/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

// Note: nats-streaming is in the process of being deprecated.
// https://docs.nats.io/legacy/stan#warning-deprecation-notice

'use strict';

const shimmer = require('../../shimmer');
const hook = require('../../../util/hook');
const tracingUtil = require('../../tracingUtil');
const constants = require('../../constants');
const cls = require('../../cls');

let isActive = false;
let clientHasBeenInstrumented = false;
let logger;

exports.init = function init(config) {
  logger = config.logger;

  hook.onModuleLoad('node-nats-streaming', instrumentNatsStreaming);
};

function instrumentNatsStreaming(natsStreamingModule) {
  logger.warn(
    // eslint-disable-next-line max-len
    '[Deprecation Warning] The support for node-nats-streaming library is deprecated and might be removed ' +
      'in the next major release. The library is EOL, see https://github.com/nats-io/stan.js?tab=readme-ov-file.'
  );

  shimmer.wrap(natsStreamingModule, 'connect', shimConnect);
}

function shimConnect(originalFunction) {
  return function () {
    const client = originalFunction.apply(this, arguments);
    client._natsUrl = client.options.url;
    if (!clientHasBeenInstrumented) {
      shimmer.wrap(client.constructor.prototype, 'publish', shimPublish);
      shimmer.wrap(client.constructor.prototype, 'subscribe', shimSubscribe);
      clientHasBeenInstrumented = true;
    }
    return client;
  };
}

function shimPublish(originalFunction) {
  return function () {
    const originalArgs = new Array(arguments.length);
    for (let i = 0; i < arguments.length; i++) {
      originalArgs[i] = arguments[i];
    }

    return instrumentedPublish(this, originalFunction, originalArgs);
  };
}

function instrumentedPublish(ctx, originalPublish, originalArgs) {
  if (cls.skipExitTracing({ isActive })) {
    return originalPublish.apply(ctx, originalArgs);
  }

  const subject = originalArgs[0];
  const originalCallback = typeof originalArgs[2] === 'function' ? originalArgs[2] : null;

  return cls.ns.runAndReturn(() => {
    const span = cls.startSpan({
      spanName: 'nats.streaming',
      kind: constants.EXIT
    });
    span.ts = Date.now();
    span.stack = tracingUtil.getStackTrace(instrumentedPublish);
    span.data.nats = {
      sort: 'publish',
      address: ctx._natsUrl,
      subject
    };

    if (originalCallback) {
      originalArgs[2] = cls.ns.bind(function (err) {
        addErrorToSpan(err, span);
        finishSpan(span);
        originalCallback.apply(this, arguments);
      });
    }

    try {
      return originalPublish.apply(ctx, originalArgs);
    } catch (e) {
      addErrorToSpan(e, span);
      throw e;
    } finally {
      if (!originalCallback) {
        finishSpan(span);
      }
    }
  });
}

function shimSubscribe(originalFunction) {
  return function () {
    const subscription = originalFunction.apply(this, arguments);
    if (subscription) {
      shimmer.wrap(subscription, 'emit', shimSubscriptionEmit.bind(null, arguments[0]));
    }
    return subscription;
  };
}

function shimSubscriptionEmit(subject, originalFunction) {
  return function (type) {
    if (isActive && (type === 'message' || type === 'error')) {
      const originalArgs = new Array(arguments.length);
      for (let i = 0; i < arguments.length; i++) {
        originalArgs[i] = arguments[i];
      }
      return instrumentedEmit(this, originalFunction, originalArgs, subject);
    }
    return originalFunction.apply(this, arguments);
  };
}

function instrumentedEmit(ctx, originalEmit, originalArgs, subject) {
  if (originalArgs[0] === 'message') {
    return captureMessageSpan(ctx, originalEmit, originalArgs, subject);
  } else if (originalArgs[0] === 'error') {
    return captureErrorInCurrentSpan(ctx, originalEmit, originalArgs);
  }
}

function captureMessageSpan(ctx, originalEmit, originalArgs, subject) {
  let span;
  const activeSpan = cls.getCurrentSpan();

  let natsUrl;
  if (activeSpan && activeSpan.n === 'nats' && constants.isEntrySpan(activeSpan)) {
    // Expected case: The raw nats instrumentation kicks in earlier than the nats-streaming instrumentation, so we
    // have already started a raw nats entry span before realizing that it is in fact a nats.streaming entry. We
    // replace this raw nats span with the higher level nats.streaming span.
    span = activeSpan;
    span.n = 'nats.streaming';
    natsUrl = span.data.nats.address;
  } else if (activeSpan) {
    // Unexpected: There is already an active span, but it is not a raw nats entry span. Abort tracing this
    // nats.streaming entry.
    return originalEmit.apply(ctx, originalArgs);
  }

  return cls.ns.runAndReturn(() => {
    if (!span) {
      // Unexpected: There was no raw nats entry, in fact, there was no active span at all. We can still trace the
      // current nats.streaming entry.
      span = cls.startSpan({
        spanName: 'nats.streaming',
        kind: constants.ENTRY
      });
    }

    span.ts = Date.now();
    span.stack = tracingUtil.getStackTrace(instrumentedEmit);
    // purposefully overwrite data of raw nats entry, if present
    span.data.nats = {
      sort: 'consume',
      address: natsUrl,
      subject
    };

    try {
      return originalEmit.apply(ctx, originalArgs);
      // There is no need to capture synchronous errors here because node-nats-streaming will do that itself and emit an
      // error event, which we capture separately and attach to the current nats.streaming entry span if appropriate.
    } finally {
      setImmediate(() => {
        // Client code is expected to end the span manually, end it automatically in case client code doesn't. Child
        // exit spans won't be captured, but at least the NATS streaming entry span is there.
        finishSpan(span);
      });
    }
  });
}

function captureErrorInCurrentSpan(ctx, originalEmit, originalArgs) {
  const activeSpan = cls.getCurrentSpan();
  if (activeSpan && activeSpan.n === 'nats.streaming') {
    addErrorToSpan(originalArgs[1], activeSpan);
  }
  return originalEmit.apply(ctx, originalArgs);
}

function addErrorToSpan(err, span) {
  if (err) {
    span.ec = 1;

    const existingError = span.data.nats.error;
    tracingUtil.setErrorDetails(span, err, 'nats');

    if (existingError && span.data.nats.error && existingError !== span.data.nats.error) {
      span.data.nats.error = `${existingError}, ${span.data.nats.error}`;
    }
  }
}

function finishSpan(span) {
  span.d = Date.now() - span.ts;
  span.transmit();
}

exports.activate = function activate() {
  isActive = true;
};

exports.deactivate = function deactivate() {
  isActive = false;
};
