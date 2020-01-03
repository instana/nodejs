'use strict';

const instanaCore = require('@instana/core');
const { backendConnector, consoleLogger } = require('@instana/serverless');

const arnParser = require('./arn');
const identityProvider = require('./identity_provider');
const metrics = require('./metrics');
const triggers = require('./triggers');
const processResult = require('./process_result');

const { tracing } = instanaCore;
const { constants, spanBuffer } = tracing;
let logger = consoleLogger;
let config;

// Initialize instrumentations early to allow for require statements after our package has been required but before the
// actual instana.wrap(...) call.
instanaCore.preInit();

/**
 * Wraps an AWS Lambda handler so that metrics and traces are reported to Instana. This function will figure out if the
 * Lambda handler uses the callback style or promise/async function style by inspecting the number of function arguments
 * the function receives.
 */
exports.wrap = function wrap(_config, originalHandler) {
  /* eslint-disable no-unused-vars */
  if (arguments.length === 1) {
    originalHandler = _config;
    _config = null;
  }

  // Apparently the AWS Lambda Node.js runtime does not inspect the handlers signature for the number of arguments it
  // accepts. But to be extra safe, we strive to return a function with the same number of arguments anyway.
  switch (originalHandler.length) {
    case 0:
      return function handler0() {
        return shimmedHandler(originalHandler, this, arguments, _config);
      };
    case 1:
      return function handler1(event) {
        return shimmedHandler(originalHandler, this, arguments, _config);
      };
    case 2:
      return function handler2(event, context) {
        return shimmedHandler(originalHandler, this, arguments, _config);
      };
    default:
      return function handler3(event, context, callback) {
        return shimmedHandler(originalHandler, this, arguments, _config);
      };
  }
};

function shimmedHandler(originalHandler, originalThis, originalArgs, _config) {
  const event = originalArgs[0];
  const context = originalArgs[1];
  const lambdaCallback = originalArgs[2];

  const tracingHeaders = triggers.readTracingHeaders(event);
  const incomingTraceId = tracingHeaders.t;
  const incomingParentSpanId = tracingHeaders.s;
  const tracingSuppressed = tracingHeaders.l === '0';
  const arnInfo = arnParser(context);

  init(event, arnInfo, _config);

  // The AWS lambda runtime does not seem to inspect the number of arguments the handler function expects. Instead, it
  // always call the handler with three arguments (event, context, callback), no matter if the handler will use the
  // callback or not. If the handler returns a promise, the runtime uses the that promise's value when it resolves as
  // the result. If the handler calls the callback, that value is used as the result. If the handler does both
  // (return a promise and resolve it _and_ call the callback), it depends on the timing. Whichever happens first
  // dictates the result of the lambda invocation, the later result is ignored. To match this behaviour, we always
  // wrap the given callback _and_ return an instrumented promise.
  let handlerHasFinished = false;
  return tracing.getCls().ns.runPromiseOrRunAndReturn(() => {
    let entrySpan;
    if (tracingSuppressed) {
      tracing.getCls().setTracingLevel('0');
    } else {
      entrySpan = tracing
        .getCls()
        .startSpan('aws.lambda.entry', constants.ENTRY, incomingTraceId, incomingParentSpanId);
      const { arn, alias } = arnInfo;
      entrySpan.data.lambda = {
        arn,
        alias,
        runtime: 'nodejs',
        functionName: context.functionName,
        functionVersion: context.functionVersion
      };
      triggers.enrichSpanWithTriggerData(event, entrySpan);
    }

    originalArgs[2] = function wrapper(originalError, originalResult) {
      if (handlerHasFinished) {
        lambdaCallback(originalError, originalResult);
        return;
      }
      handlerHasFinished = true;
      postHandler(entrySpan, originalError, originalResult, () => {
        lambdaCallback(originalError, originalResult);
      });
    };

    // The functions context.done, context.succeed, and context.fail constitute a deprecated legacy Lambda API from the
    // very first incarnations of the Node.js Lambda execution environment from ca. 2016. Although it is not documented
    // anymore in the AWS Lambda docs, it still works (and is also used by some customers). See
    // eslint-disable-next-line max-len
    // https://web.archive.org/web/20161216092320/https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-using-old-runtime.html
    // for information about it.
    const originalDone = context.done;
    context.done = (originalError, originalResult) => {
      if (handlerHasFinished) {
        originalDone(originalError, originalResult);
        return;
      }
      handlerHasFinished = true;
      postHandler(entrySpan, originalError, originalResult, () => {
        originalDone(originalError, originalResult);
      });
    };

    const originalSucceed = context.succeed;
    context.succeed = originalResult => {
      if (handlerHasFinished) {
        originalSucceed(originalResult);
        return;
      }
      handlerHasFinished = true;
      postHandler(entrySpan, undefined, originalResult, () => {
        originalSucceed(originalResult);
      });
    };

    const originalFail = context.fail;
    context.fail = originalError => {
      if (handlerHasFinished) {
        originalFail(originalError);
        return;
      }
      handlerHasFinished = true;
      postHandler(entrySpan, originalError, undefined, () => {
        originalFail(originalError);
      });
    };

    let handlerPromise;
    try {
      handlerPromise = originalHandler.apply(originalThis, originalArgs);
      if (handlerPromise && typeof handlerPromise.then === 'function') {
        return handlerPromise.then(
          value => {
            process.handlerFinished = Date.now();
            console.log('FINISHED', process.handlerFinished);
            if (handlerHasFinished) {
              return Promise.resolve(value);
            }
            handlerHasFinished = true;
            return postPromise(entrySpan, null, value);
          },
          error => {
            if (handlerHasFinished) {
              return Promise.reject(error);
            }
            handlerHasFinished = true;
            return postPromise(entrySpan, error);
          }
        );
      } else {
        return handlerPromise;
      }
    } catch (e) {
      // A synchronous exception occured in the original handler.
      handlerHasFinished = true;
      // eslint-disable-next-line no-console
      console.error(
        // eslint-disable-next-line max-len
        'Your Lambda handler threw a synchronous exception. To report this call (including the error) to Instana, we need to convert this synchronous failure into an asynchronous failure.',
        e
      );

      postHandler(entrySpan, e, undefined, () => {
        // rethrow original exception
        throw e;
      });
      return handlerPromise;
    }
  });
}

/**
 * Initialize the wrapper.
 */
function init(event, arnInfo, _config) {
  /* eslint-disable dot-notation */
  config = _config || {};

  if (config.logger) {
    logger = config.logger;
  } else if (config.level || process.env['INSTANA_LOG_LEVEL']) {
    logger.setLevel(config.level || process.env['INSTANA_LOG_LEVEL']);
  }
  identityProvider.init(arnInfo);
  backendConnector.init(identityProvider, logger);

  instanaCore.init(config, backendConnector, identityProvider);

  metrics.init(config);
  metrics.activate();
  tracing.activate();
}

/**
 * Code to be executed after the promise returned by the original handler has completed.
 */
function postPromise(entrySpan, error, value) {
  return new Promise((resolve, reject) => {
    postHandler(entrySpan, error, value, () => {
      console.log('INSTANA DELAY', Date.now() - process.handlerFinished);
      if (error) {
        reject(error);
      } else {
        resolve(value);
      }
    });
  });
}

function postHandler(entrySpan, error, result, callback) {
  // entrySpan is null when tracing is suppressed due to X-Instana-L
  if (entrySpan) {
    if (error) {
      entrySpan.ec = 1;
      entrySpan.data.lambda.error = error.message ? error.message : error.toString();
    }

    processResult(result, entrySpan);

    entrySpan.error = entrySpan.ec > 0;
    entrySpan.d = Date.now() - entrySpan.ts;

    entrySpan.transmit();
  }

  const spans = spanBuffer.getAndResetSpans();

  const metricsData = metrics.gatherData();

  const metricsPayload = {
    plugins: [{ name: 'com.instana.plugin.aws.lambda', entityId: identityProvider.getEntityId(), data: metricsData }]
  };

  backendConnector.sendBundle({ spans, metrics: metricsPayload }, err => {
    if (err) {
      // We intentionally do not propagate the error from the backend request - the customer's lambda needs to finish
      // successfully, no matter if we have been able to report metrics and spans.
      logger.warn('Could not send traces and metrics to Instana.', err.message);
      logger.debug('Could not send traces and metrics to Instana.', err);
    } else {
      logger.info('Traces and metrics have been sent to Instana.');
    }
    callback();
  });
}

exports.currentSpan = function getHandleForCurrentSpan() {
  return tracing.getHandleForCurrentSpan();
};

exports.sdk = tracing.sdk;

exports.setLogger = function setLogger(_logger) {
  logger = _logger;
  config.logger = logger;
  instanaCore.logger.init(config);
};

exports.opentracing = tracing.opentracing;
