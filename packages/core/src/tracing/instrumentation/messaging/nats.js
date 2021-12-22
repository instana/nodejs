/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const shimmer = require('shimmer');

const requireHook = require('../../../util/requireHook');
const tracingUtil = require('../../tracingUtil');
const constants = require('../../constants');
const cls = require('../../cls');

let isActive = false;
let clientHasBeenInstrumented = false;

exports.init = function init() {
  requireHook.onModuleLoad('nats', instrumentNats);
};

function instrumentNats(natsModule) {
  shimmer.wrap(natsModule, 'connect', shimConnect);
}

function shimConnect(originalFunction) {
  return function () {
    const client = originalFunction.apply(this, arguments);
    if (!clientHasBeenInstrumented) {
      shimmer.wrap(client.constructor.prototype, 'publish', shimPublish.bind(null, client.options.url));

      // nats.requestOne uses nats.request internally, so there is no need to instrument requestOne separately
      shimmer.wrap(client.constructor.prototype, 'request', shimRequest);

      shimmer.wrap(client.constructor.prototype, 'subscribe', shimSubscribe.bind(null, client.options.url));
      clientHasBeenInstrumented = true;
    }
    return client;
  };
}

function shimPublish(natsUrl, originalFunction) {
  return function () {
    if (isActive && cls.isTracing()) {
      const originalArgs = new Array(arguments.length);
      for (let i = 0; i < arguments.length; i++) {
        originalArgs[i] = arguments[i];
      }
      return instrumentedPublish(this, originalFunction, originalArgs, natsUrl);
    }
    return originalFunction.apply(this, arguments);
  };
}

function instrumentedPublish(ctx, originalPublish, originalArgs, natsUrl) {
  const parentSpan = cls.getCurrentSpan();

  if (!cls.isTracing() || !parentSpan || constants.isExitSpan(parentSpan)) {
    return originalPublish.apply(ctx, originalArgs);
  }

  const subject = typeof originalArgs[0] !== 'function' ? originalArgs[0] : '';
  let callbackIndex = -1;
  for (let i = 3; i >= 0; i--) {
    if (typeof originalArgs[i] === 'function') {
      callbackIndex = i;
    }
  }
  const originalCallback = callbackIndex >= 0 ? originalArgs[callbackIndex] : null;

  return cls.ns.runAndReturn(() => {
    const span = cls.startSpan('nats', constants.EXIT);
    span.ts = Date.now();
    span.stack = tracingUtil.getStackTrace(instrumentedPublish);
    span.data.nats = {
      sort: 'publish',
      address: natsUrl,
      subject
    };

    if (originalCallback) {
      originalArgs[callbackIndex] = cls.ns.bind(function (err) {
        addErrorToSpan(err, span);
        finishSpan(span, 'nats');
        originalCallback.apply(this, arguments);
      });
    }

    try {
      // Up until 1.4.9, nats would throw the error synchronously when no callback is provided. With 1.4.12 (the next
      // published version after 1.4.9), this will no longer happen. Instead, it will only be emitted via the nats event
      // emitter. To capture those publisher errors, we would need to register our own event emitter. However, that is
      // too invasive just for the sake of capturing publisher errors. Thus, for version ^1.4.12, we will not capture
      // publisher errors in the span.
      //
      // See https://github.com/nats-io/nats.js/commit/9f34226823ffbd63c6f139a9d12b368a4a8adb93
      // #diff-eb672f729dbb809e0a46163f59b4f93a76975fd0b7461640db7527ecfc346749R1687
      return originalPublish.apply(ctx, originalArgs);
    } catch (e) {
      addErrorToSpan(e, span);
      throw e;
    } finally {
      if (!originalCallback) {
        finishSpan(span, 'nats');
      }
    }
  });
}

function shimRequest(originalFunction) {
  // nats.request uses nats.publish internally, we only need to cls-bind the callback here (it is not passed down to
  // nats.publish because it only fires after the reply has been received, not after the initial messages has been
  // published). Everything else is taken care of by the instrumentation of nats.publish.
  return function () {
    if (isActive && cls.isTracing()) {
      for (let i = 3; i >= 0; i--) {
        if (typeof arguments[i] === 'function') {
          arguments[i] = cls.ns.bind(arguments[i]);
          break;
        }
      }
    }
    return originalFunction.apply(this, arguments);
  };
}

function shimSubscribe(natsUrl, originalFunction) {
  return function () {
    const originalSubscribeArgs = new Array(arguments.length);
    for (let i = 0; i < arguments.length; i++) {
      originalSubscribeArgs[i] = arguments[i];
    }
    return instrumentedSubscribe(this, originalFunction, originalSubscribeArgs, natsUrl);
  };
}

function instrumentedSubscribe(ctx, originalSubscribe, originalSubscribeArgs, natsUrl) {
  const subject = originalSubscribeArgs[0];
  for (let i = 2; i >= 1; i--) {
    if (typeof originalSubscribeArgs[i] === 'function') {
      const originalSubscribeCallback = originalSubscribeArgs[i];
      originalSubscribeArgs[i] = instrumentedSubscribeCallback(natsUrl, subject, originalSubscribeCallback);
      break;
    }
  }

  return originalSubscribe.apply(ctx, originalSubscribeArgs);
}

function instrumentedSubscribeCallback(natsUrl, subject, originalSubscribeCallback) {
  return function () {
    const originalCallbackThis = this;
    const originalCallbackArgs = new Array(arguments.length);
    for (let i = 0; i < arguments.length; i++) {
      originalCallbackArgs[i] = arguments[i];
    }

    // Prefer actual subject given to callback over the subject given to the subscribe call, which could
    // contain wildcards.
    subject = typeof originalCallbackArgs[2] === 'string' ? originalCallbackArgs[2] : subject;

    return cls.ns.runAndReturn(() => {
      if (isActive) {
        const span = cls.startSpan('nats', constants.ENTRY);
        span.ts = Date.now();
        span.stack = tracingUtil.getStackTrace(instrumentedSubscribeCallback);

        // command, type, sort, operation
        span.data.nats = {
          sort: 'consume',
          address: natsUrl,
          subject
        };

        try {
          return originalSubscribeCallback.apply(originalCallbackThis, originalCallbackArgs);
        } catch (e) {
          addErrorToSpan(e, span);
          throw e;
        } finally {
          setImmediate(() => {
            // Client code is expected to end the span manually, end it automatically in case client code doesn't. Child
            // exit spans won't be captured, but at least the NATS entry span is there.
            finishSpan(span, 'nats');
          });
        }
      } else {
        return originalSubscribeCallback.apply(originalCallbackThis, originalCallbackArgs);
      }
    });
  };
}

function addErrorToSpan(err, span) {
  if (err) {
    span.ec = 1;

    let errMsg = null;
    if (err.message) {
      errMsg = err.message;
    } else if (typeof err === 'string') {
      errMsg = err;
    }
    if (errMsg && span.data.nats.error) {
      span.data.nats.error += `, ${errMsg}`;
    } else if (errMsg) {
      span.data.nats.error = errMsg;
    }
  }
}

function finishSpan(span, expectedName) {
  // Only overwrite span attributes and transmit if this span has not been replaced with higher priority span
  // (like nats.streaming).
  if (!span.transmitted && span.n === expectedName) {
    span.d = Date.now() - span.ts;
    span.transmit();
  }
}

exports.activate = function activate() {
  isActive = true;
};

exports.deactivate = function deactivate() {
  isActive = false;
};
