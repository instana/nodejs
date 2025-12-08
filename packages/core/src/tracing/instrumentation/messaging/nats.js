/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const shimmer = require('../../shimmer');

const hook = require('../../../util/hook');
const tracingUtil = require('../../tracingUtil');
const constants = require('../../constants');
const cls = require('../../cls');

let isActive = false;
let clientHasBeenInstrumentedV1 = false;
let clientHasBeenInstrumentedV2 = false;

exports.init = function init() {
  hook.onModuleLoad('nats', instrumentNats);
};

let natsModule;
let connectionObject;

function instrumentNats(_natsModule) {
  natsModule = _natsModule;
  shimmer.wrap(natsModule, 'connect', shimConnect);
}

function shimConnect(originalFunction) {
  return function () {
    const client = originalFunction.apply(this, arguments);
    const isPromise = client && client.then && client.catch;

    if (isPromise) {
      // Nats 2.x
      client.then(nc => {
        connectionObject = nc;

        let natsUrl = 'nats://';
        if (nc.protocol && nc.protocol.server && nc.protocol.server.listen) {
          natsUrl = `nats://${nc.protocol.server.listen}`;
        }

        nc._natsUrl = natsUrl;

        if (!clientHasBeenInstrumentedV2) {
          shimmer.wrap(nc.constructor.prototype, 'publish', shimPublish.bind(null, true));
          shimmer.wrap(nc.constructor.prototype, 'request', shimRequest.bind(null));
          shimmer.wrap(nc.constructor.prototype, 'subscribe', shimSubscribe.bind(null, true));
          clientHasBeenInstrumentedV2 = true;
        }

        return nc;
      });
    } else {
      // Nats 1.x
      if (client.options.url) {
        // Passing in options.url is one way to specify a server,
        // see https://github.com/nats-io/nats.js/tree/v1.4.12#basic-authentication
        client._natsUrl = client.options.url;
      } else if (Array.isArray(client.options.servers)) {
        // Providing a servers array is another way to specify the NATS server(s),
        // see https://github.com/nats-io/nats.js/tree/v1.4.12#clustered-usage
        client._natsUrl = client.options.servers[0];
      } else {
        // default value if client is created without arguments
        client._natsUrl = 'nats://localhost:4222';
      }

      if (!clientHasBeenInstrumentedV1) {
        shimmer.wrap(client.constructor.prototype, 'publish', shimPublish.bind(null, false));

        // nats.requestOne uses nats.request internally, so there is no need to instrument requestOne separately
        shimmer.wrap(client.constructor.prototype, 'request', shimRequest.bind(null));

        shimmer.wrap(client.constructor.prototype, 'subscribe', shimSubscribe.bind(null, true));
        clientHasBeenInstrumentedV1 = true;
      }
    }

    return client;
  };
}

function shimPublish(isLatest, originalFunction) {
  return function () {
    const originalArgs = new Array(arguments.length);
    for (let i = 0; i < arguments.length; i++) {
      originalArgs[i] = arguments[i];
    }

    return instrumentedPublish(this, originalFunction, originalArgs, isLatest);
  };
}

function addSuppressionHeaders(args, isLatest) {
  if (!isLatest) return;
  if (!natsModule || !natsModule.headers) return;
  if (!connectionObject || !connectionObject.info) return;
  // not every docker nats version supports headers
  if (!connectionObject.info.headers) return;

  const opts = args[2];
  const Headers = natsModule.headers;

  if (opts && opts.headers && typeof opts.headers === 'object') {
    opts.headers.append(constants.traceLevelHeaderName, '0');
  } else if (!opts) {
    const h = Headers();
    h.append(constants.traceLevelHeaderName, '0');
    args[2] = { headers: h };
  } else {
    const h = Headers();
    h.append(constants.traceLevelHeaderName, '0');
    opts.headers = h;
  }
}

function addTraceCorrelationHeaders(args, isLatest, span) {
  if (!isLatest) return;
  if (!natsModule || !natsModule.headers) return;
  if (!connectionObject || !connectionObject.info) return;
  // not every docker nats version supports headers
  if (!connectionObject.info.headers) return;

  const opts = args[2];
  const Headers = natsModule.headers;

  if (opts && opts.headers && typeof opts.headers === 'object') {
    opts.headers.append(constants.traceIdHeaderName, span.t);
    opts.headers.append(constants.spanIdHeaderName, span.s);
  } else if (!opts) {
    const h = Headers();
    h.append(constants.traceIdHeaderName, span.t);
    h.append(constants.spanIdHeaderName, span.s);
    args[2] = { headers: h };
  } else {
    const h = Headers();
    h.append(constants.traceIdHeaderName, span.t);
    h.append(constants.spanIdHeaderName, span.s);
    opts.headers = h;
  }
}

function instrumentedPublish(ctx, originalPublish, originalArgs, isLatest) {
  const skipTracingResult = cls.skipExitTracing({ isActive: true, extendedResponse: true });
  if (skipTracingResult.skip) {
    if (skipTracingResult.suppressed) {
      addSuppressionHeaders(originalArgs, isLatest);
    }

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
    const span = cls.startSpan({
      spanName: 'nats',
      kind: constants.EXIT
    });
    span.ts = Date.now();
    span.stack = tracingUtil.getStackTrace(instrumentedPublish);
    span.data.nats = {
      sort: 'publish',
      address: ctx._natsUrl,
      subject
    };

    addTraceCorrelationHeaders(originalArgs, isLatest, span);

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
      const result = originalPublish.apply(ctx, originalArgs);

      if (result && typeof result.catch === 'function') {
        // nats v2 internally suddenly returns a promise.reject instead of simply throwing the error
        // affected case: .request(null) (subject missing error)
        result.catch(err => {
          addErrorToSpan(err, span);
        });
      }

      setImmediate(() => {
        finishSpan(span, 'nats');
      });

      return result;
    } catch (e) {
      addErrorToSpan(e, span);
      finishSpan(span, 'nats');
      throw e;
    }
  });
}

function shimRequest(originalFunction) {
  // nats 1.x:
  // nats.request uses nats.publish internally, we only need to cls-bind the callback here (it is not passed down to
  // nats.publish because it only fires after the reply has been received, not after the initial messages has been
  // published). Everything else is taken care of by the instrumentation of nats.publish.
  return function () {
    if (isActive && cls.isTracing()) {
      // nats 2.x
      if (this.protocol && this.protocol.transport) {
        const opts = arguments[2];

        // CASE: requestOne -> internally nats calls request & publish, skip request call
        if (opts && 'noMux' in opts && !opts.noMux) {
          return originalFunction.apply(this, arguments);
        }

        return instrumentedPublish(this, originalFunction, arguments);
      } else {
        for (let i = 3; i >= 0; i--) {
          if (typeof arguments[i] === 'function') {
            arguments[i] = cls.ns.bind(arguments[i]);
            break;
          }
        }

        return originalFunction.apply(this, arguments);
      }
    } else {
      return originalFunction.apply(this, arguments);
    }
  };
}

function shimSubscribe(isLatest, originalFunction) {
  return function () {
    const originalSubscribeArgs = new Array(arguments.length);
    for (let i = 0; i < arguments.length; i++) {
      originalSubscribeArgs[i] = arguments[i];
    }
    return instrumentedSubscribe(this, originalFunction, originalSubscribeArgs, isLatest);
  };
}

function instrumentedSubscribe(ctx, originalSubscribe, originalSubscribeArgs, isLatest) {
  const subject = originalSubscribeArgs[0];
  let callbackIndex = -1;
  let isCallbackAttr = false;

  for (let i = 2; i >= 1; i--) {
    if (typeof originalSubscribeArgs[i] === 'function') {
      callbackIndex = i;
    } else if (
      originalSubscribeArgs[i] &&
      originalSubscribeArgs[i].callback &&
      typeof originalSubscribeArgs[i].callback === 'function'
    ) {
      callbackIndex = i;
      isCallbackAttr = true;
    }
  }

  if (callbackIndex > -1) {
    let originalCallback;

    if (isCallbackAttr) {
      originalCallback = originalSubscribeArgs[callbackIndex].callback;
      originalSubscribeArgs[callbackIndex].callback = function (err, msg) {
        return instrumentedSubscribeCallback(ctx._natsUrl, subject, originalCallback, null, isLatest).bind(this)(
          err,
          msg
        );
      };
    } else {
      originalCallback = originalSubscribeArgs[callbackIndex];
      originalSubscribeArgs[callbackIndex] = instrumentedSubscribeCallback(ctx._natsUrl, subject, originalCallback);
    }

    return originalSubscribe.apply(ctx, originalSubscribeArgs);
  } else {
    return cls.ns.runAndReturn(currentCtx => {
      const sub = originalSubscribe.apply(ctx, originalSubscribeArgs);

      // NOTE: we attach our own iterator to receive the messages and then call the customer's iterator
      const createIterator = async function* instanaIterator() {
        cls.ns.enter(currentCtx);

        // eslint-disable-next-line no-restricted-syntax
        for await (const msg of sub) {
          await new Promise(resolve => {
            instrumentedSubscribeCallback(ctx._natsUrl, subject, resolve, currentCtx, isLatest)(null, msg);
          });

          yield msg;
        }
      };

      const instanaIterator = createIterator();
      Object.assign(instanaIterator, sub);
      return instanaIterator;
    });
  }
}

function instrumentedSubscribeCallback(natsUrl, subject, originalSubscribeCallback, instanaCtx, isLatest) {
  return function (err, msg) {
    let suppressed = false;
    let traceId;
    let parentSpanId;

    const originalCallbackThis = this;
    const originalCallbackArgs = new Array(arguments.length);
    for (let i = 0; i < arguments.length; i++) {
      originalCallbackArgs[i] = arguments[i];
    }

    if (isLatest && msg && msg.headers) {
      // eslint-disable-next-line no-restricted-syntax
      for (const [key, value] of msg.headers) {
        if (key === constants.traceLevelHeaderName && value[0] === '0') {
          suppressed = true;
        } else if (key === constants.traceIdHeaderName) {
          traceId = value[0];
        } else if (key === constants.spanIdHeaderName) {
          parentSpanId = value[0];
        }
      }
    }

    // Prefer actual subject given to callback over the subject given to the subscribe call, which could
    // contain wildcards.
    subject = typeof originalCallbackArgs[2] === 'string' ? originalCallbackArgs[2] : subject;

    return cls.ns.runAndReturn(() => {
      if (suppressed) {
        cls.setTracingLevel('0');
        return originalSubscribeCallback.apply(originalCallbackThis, originalCallbackArgs);
      }

      if (isActive) {
        const span = cls.startSpan({
          spanName: 'nats',
          kind: constants.ENTRY,
          traceId: traceId,
          parentSpanId: parentSpanId
        });
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
    }, instanaCtx);
  };
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
