/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const instanaCore = require('@instana/core');
const { backendConnector, consoleLogger: serverlessLogger, environment } = require('@instana/serverless');
const arnParser = require('./arn');
const identityProvider = require('./identity_provider');
const metrics = require('./metrics');
const ssm = require('./ssm');
const triggers = require('./triggers');
const processResult = require('./process_result');
const captureHeaders = require('./capture_headers');

const { tracing, coreConfig } = instanaCore;
const { tracingHeaders, constants, spanBuffer } = tracing;

const lambdaConfigDefaults = {
  tracing: { forceTransmissionStartingAt: 25, transmissionDelay: 100, initialTransmissionDelay: 100 }
};

const logger = serverlessLogger.init();
coreConfig.init(logger);
let config = coreConfig.normalize({}, lambdaConfigDefaults);
let coldStart = true;

// Initialize instrumentations early to allow for require statements after our
// package has been required but before the actual instana.wrap(...) call.
instanaCore.preInit(config);

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

  // For Node.js 24+, we must always return a handler with 2 parameters (event, context) to avoid
  // the Runtime.CallbackHandlerDeprecated error. The shimmedHandler internally handles both
  // callback-based and promise-based original handlers.
  switch (originalHandler.length) {
    case 0:
      return function handler0() {
        return shimmedHandler(originalHandler, this, arguments, _config);
      };
    case 1:
      return function handler1(event) {
        return shimmedHandler(originalHandler, this, arguments, _config);
      };
    default:
      // For handlers with 2 or 3 parameters, always return a 2-parameter function
      return function handler2(event, context) {
        return shimmedHandler(originalHandler, this, arguments, _config);
      };
  }
};

function shimmedHandler(originalHandler, originalThis, originalArgs, _config) {
  const event = originalArgs[0];
  const context = originalArgs[1];
  const lambdaCallback = originalArgs[2];

  const arnInfo = arnParser(context);
  const tracingEnabled = init(event, arnInfo, _config);

  if (!tracingEnabled) {
    return originalHandler.apply(originalThis, originalArgs);
  }

  // The AWS lambda runtime does not seem to inspect the number of arguments the handler function expects. Instead, it
  // always call the handler with three arguments (event, context, callback), no matter if the handler will use the
  // callback or not. If the handler returns a promise, the runtime uses the that promise's value when it resolves as
  // the result. If the handler calls the callback, that value is used as the result. If the handler does both
  // (return a promise and resolve it _and_ call the callback), it depends on the timing. Whichever happens first
  // dictates the result of the lambda invocation, the later result is ignored. To match this behaviour, we always
  // wrap the given callback _and_ return an instrumented promise.
  let handlerHasFinished = false;
  return tracing.getCls().ns.runPromiseOrRunAndReturn(() => {
    const traceCorrelationData = triggers.readTraceCorrelationData(event, context);
    const tracingSuppressed = traceCorrelationData.level === '0';
    const w3cTraceContext = traceCorrelationData.w3cTraceContext;

    let entrySpan;

    if (w3cTraceContext) {
      // Ususally we commit the W3C trace context to CLS in start span, but in some cases (e.g. when suppressed),
      // we don't call startSpan, so we write to CLS here unconditionally. If we also write an updated trace context
      // later, the one written here will be overwritten.
      tracing.getCls().setW3cTraceContext(w3cTraceContext);
    }

    if (tracingSuppressed) {
      tracing.getCls().setTracingLevel('0');
      if (w3cTraceContext) {
        w3cTraceContext.disableSampling();
      }
    } else {
      entrySpan = tracing.getCls().startSpan({
        spanName: 'aws.lambda.entry',
        kind: constants.ENTRY,
        traceId: traceCorrelationData.traceId,
        parentSpanId: traceCorrelationData.parentId,
        w3cTraceContext: w3cTraceContext
      });
      tracingHeaders.setSpanAttributes(entrySpan, traceCorrelationData);
      const { arn, alias } = arnInfo;
      entrySpan.data.lambda = {
        arn,
        alias,
        runtime: 'nodejs',
        functionName: context.functionName,
        functionVersion: context.functionVersion,
        reqId: context.awsRequestId
      };
      if (coldStart) {
        entrySpan.data.lambda.coldStart = true;
        coldStart = false;
      }
      triggers.enrichSpanWithTriggerData(event, context, entrySpan);
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

    /**
     * We offer the customer to enable the timeout detection
     * But its not recommended to use it on production, only for debugging purposes.
     * See https://github.com/instana/nodejs/pull/668.
     */
    if (
      process.env.INSTANA_ENABLE_LAMBDA_TIMEOUT_DETECTION &&
      process.env.INSTANA_ENABLE_LAMBDA_TIMEOUT_DETECTION === 'true'
    ) {
      logger.debug('Heuristical timeout detection enabled. Please only use for debugging purposes.');
      registerTimeoutDetection(context, entrySpan);
    }

    let handlerPromise;
    try {
      handlerPromise = originalHandler.apply(originalThis, originalArgs);
      if (handlerPromise && typeof handlerPromise.then === 'function') {
        return handlerPromise.then(
          value => {
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
  const userConfig = _config || {};

  // CASE: customer provides a custom logger or custom level
  if (userConfig.logger || userConfig.level) {
    serverlessLogger.init(userConfig);
  }

  // NOTE: We SHOULD renormalize because of:
  //         - in-code _config object
  //         - late env variables (less likely)
  //         - custom logger
  //         - we always renormalize unconditionally to ensure safety.
  config = coreConfig.normalize(userConfig, lambdaConfigDefaults);

  if (!config.tracing.enabled) {
    return false;
  }

  const useLambdaExtension = shouldUseLambdaExtension();
  if (useLambdaExtension) {
    logger.info('@instana/aws-lambda will use the Instana Lambda extension to send data to the Instana back end.');
  } else {
    logger.info(
      '@instana/aws-lambda will not use the Instana Lambda extension, but instead send data to the Instana back end ' +
        'directly.'
    );
  }

  identityProvider.init(arnInfo);
  triggers.init(config);
  backendConnector.init({
    config,
    identityProvider,
    defaultTimeout: 500,
    useLambdaExtension,
    isLambdaRequest: true,
    // NOTE: We only retry for the extension, because if the extenion is not used, the time to transmit
    //       the data to the serverless acceptor directly takes too long.
    retries: !!useLambdaExtension
  });

  instanaCore.init(config, backendConnector, identityProvider);

  // After core init, because ssm requires require('@aws-sdk/client-ssm'), which triggers
  // the requireHook + shimmer. Any module which requires another external module has to be
  // initialized after the core.
  ssm.init(config);

  spanBuffer.setIsFaaS(true);
  captureHeaders.init(config);
  metrics.init(config);
  metrics.activate();
  tracing.activate();

  return true;
}

function registerTimeoutDetection(context, entrySpan) {
  // We register the timeout detection directly at the start so getRemainingTimeInMillis basically gives us the
  // configured timeout for this Lambda function, minus roughly 50 - 100 ms that is spent in bootstrapping.
  const initialRemainingMillis = getRemainingTimeInMillis(context);
  if (typeof initialRemainingMillis !== 'number') {
    return;
  }

  const minimumTimeoutInMs = process.env.INSTANA_MINIMUM_LAMBDA_TIMEOUT_FOR_TIMEOUT_DETECTION_IN_MS
    ? Number(process.env.INSTANA_MINIMUM_LAMBDA_TIMEOUT_FOR_TIMEOUT_DETECTION_IN_MS)
    : 2000;

  if (initialRemainingMillis <= minimumTimeoutInMs) {
    logger.debug(
      'Heuristical timeout detection will be disabled for Lambda functions with a short timeout ' +
        '(2 seconds and smaller).'
    );
    return;
  }

  let triggerTimeoutHandlingAfter;
  if (initialRemainingMillis <= 4000) {
    // For Lambdas configured with a timeout of 3 or 4 seconds we heuristically assume a timeout when only
    // 10% of time is remaining.
    triggerTimeoutHandlingAfter = initialRemainingMillis * 0.9;
  } else {
    // For Lambdas configured with a timeout of  5 seconds or more we heuristically assume a timeout when only 400 ms of
    // time are remaining.
    triggerTimeoutHandlingAfter = initialRemainingMillis - 400;
  }

  logger.debug(
    `Registering heuristical timeout detection to be triggered in ${triggerTimeoutHandlingAfter} milliseconds.`
  );

  setTimeout(() => {
    postHandlerForTimeout(entrySpan, getRemainingTimeInMillis(context));
  }, triggerTimeoutHandlingAfter).unref();
}

function getRemainingTimeInMillis(context) {
  if (context && typeof context.getRemainingTimeInMillis === 'function') {
    return context.getRemainingTimeInMillis();
  } else {
    logger.warn('context.getRemainingTimeInMillis() is not available, timeout detection will be disabled.');
    return null;
  }
}

// NOTE: This function only "guesses" whether the Lambda extension should be used or not.
// TODO: Figure out how we can reliably determine whether the Lambda extension should be
//       used or not e.g. by checking the lambda handler name if that is possible.
function shouldUseLambdaExtension() {
  if (process.env.INSTANA_DISABLE_LAMBDA_EXTENSION) {
    logger.info('INSTANA_DISABLE_LAMBDA_EXTENSION is set, not using the Lambda extension.');
    return false;
  } else {
    // Note: We could also use context.memoryLimitInMB here instead of the env var AWS_LAMBDA_FUNCTION_MEMORY_SIZE (both
    // should always yield the same value), but this behaviour needs to be in sync with what the Lambda extension does.
    // The context object is not available to the extension, so we prefer the env var over the value from the context.
    const memorySetting = process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;
    if (!memorySetting) {
      logger.debug(
        'The environment variable AWS_LAMBDA_FUNCTION_MEMORY_SIZE is not present, cannot determine memory settings.'
      );
      return true;
    }
    const memorySize = parseInt(memorySetting, 10);
    if (isNaN(memorySize)) {
      logger.debug(
        `Could not parse the value of the environment variable AWS_LAMBDA_FUNCTION_MEMORY_SIZE: "${memorySetting}", ` +
          'cannot determine memory settings, not using the Lambda extension.'
      );
      return false;
    }
    if (memorySize < 256) {
      let logFn = logger.debug;

      // CASE: We try to determine if the customer has the extension installed. We need to put a warning
      //       because the extension is **not** working and might block the lambda extension when
      //       its not used correctly e.g. slow startup of extension or waiting for invokes or incoming spans
      //       from the tracer.
      if (process.env._HANDLER?.includes('instana-aws-lambda-auto-wrap')) {
        logFn = logger.warn;
      }

      logFn(
        'The Lambda function is configured with less than 256 MB of memory according to the value of ' +
          `AWS_LAMBDA_FUNCTION_MEMORY_SIZE: ${memorySetting}. The Lambda extension does ` +
          'not work with 256mb reliably with low memory settings. ' +
          'As the extension is already running, it might ' +
          'block the lambda execution which can result in larger execution times. Please configure at least ' +
          '256 MB of memory for your Lambda function.'
      );

      return false;
    }

    return true;
  }
}

/**
 * A wrapper for post handler for promise based Lambdas (including async style Lambdas), to be executed after the
 * promise returned by the original handler has completed.
 */
function postPromise(entrySpan, error, value) {
  return new Promise((resolve, reject) => {
    postHandler(entrySpan, error, value, () => {
      if (error) {
        reject(error);
      } else {
        resolve(value);
      }
    });
  });
}

function sendToBackend({ spans, metricsPayload, finalLambdaRequest, callback }) {
  const runBackendConnector = () => {
    return backendConnector.sendBundle({ spans, metrics: metricsPayload }, finalLambdaRequest, callback);
  };

  // CASE: Customer uses process.env.INSTANA_AGENT_KEY
  if (!ssm.isUsed()) {
    return runBackendConnector();
  }

  return ssm.waitAndGetInstanaKey((err, value) => {
    if (err) {
      logger.debug(err);
      return callback();
    }

    environment.setInstanaAgentKey(value);
    return runBackendConnector();
  });
}

/**
 * When the original handler has completed, the postHandler will finish the entry span that represents the Lambda
 * invocation and makes sure the final batch of data (including the Lambda entry span) is sent to the back end before
 * letting the Lambda finish (that is, before letting the AWS Lambda runtime process the next invocation or freeze the
 * current process).
 */
function postHandler(entrySpan, error, result, postHandlerDone) {
  // entrySpan is null when tracing is suppressed due to X-Instana-L
  if (entrySpan) {
    if (entrySpan.transmitted) {
      // The only possible reason for the entry span to already have been transmitted is when the timeout detection
      // kicked in and finished the entry span prematurely. If that happened, we also have already triggered sending
      // spans to the back end. We do not need to keep the Lambda waiting for another transmission, so we immediately
      // let it finish.
      postHandlerDone();
      return;
    }

    if (error) {
      entrySpan.ec = 1;
      if (error.message) {
        if (typeof error.message === 'string') {
          entrySpan.data.lambda.error = error.message;
        } else {
          entrySpan.data.lambda.error = JSON.stringify(error.message);
        }
      } else {
        entrySpan.data.lambda.error = error.toString();
      }
    }

    processResult(result, entrySpan);

    entrySpan.d = Date.now() - entrySpan.ts;

    entrySpan.transmit();
  }

  const spans = spanBuffer.getAndResetSpans();

  // We want that all upcoming spans are send immediately to the BE.
  // Span collection happens all the time, but for AWS Lambda sending spans early via spanBuffer
  // is disabled because we cannot use `setTimeout` on AWS Lambda.
  // When the Lambda handler finishes we send all spans via `sendBundle`.
  // If there is any span collected afterwards (async operations), we send them out
  // directly and that's why we set `setTransmitImmediate` to true.
  // We need to rework the default behavior via https://jsw.ibm.com/browse/INSTA-13498
  spanBuffer.setTransmitImmediate(true);

  const metricsData = metrics.gatherData();
  const metricsPayload = {
    plugins: [{ name: 'com.instana.plugin.aws.lambda', entityId: identityProvider.getEntityId(), data: metricsData }]
  };

  sendToBackend({
    spans,
    metricsPayload,
    finalLambdaRequest: true,
    callback: () => {
      // We don't process or care if there is an error returned from the backend connector right now.
      postHandlerDone();
    }
  });
}

/**
 * When the timeout heuristic detects an imminent timeout, we finish the entry span prematurely and send it to the
 * back end.
 */
function postHandlerForTimeout(entrySpan, remainingMillis) {
  /**
   * context.getRemainingTimeInMillis(context) can return negative values
   * That just means that the lambda was already closed.
   * `setTimeout` is not 100% reliable
   */
  if (remainingMillis < 200) {
    logger.debug('Skipping heuristical timeout detection because lambda timeout exceeded already.');
    return;
  }

  if (entrySpan) {
    // CASE: Timeout not needed, we already send the data to the backend successfully
    if (entrySpan.transmitted) {
      logger.debug('Skipping heuristical timeout detection because BE data was sent already.');
      return;
    }

    entrySpan.ec = 1;
    entrySpan.data.lambda.msleft = remainingMillis;
    entrySpan.data.lambda.error = `Possible Lambda timeout with only ${remainingMillis} ms left.`;
    entrySpan.d = Date.now() - entrySpan.ts;
    entrySpan.transmit();
  }

  logger.debug(`Heuristical timeout detection was triggered with ${remainingMillis} milliseconds left.`);

  // deliberately not gathering metrics but only sending spans.
  const spans = spanBuffer.getAndResetSpans();

  sendToBackend({
    spans,
    metricsPayload: {},
    finalLambdaRequest: true,
    callback: () => {}
  });
}

exports.currentSpan = function getHandleForCurrentSpan() {
  return tracing.getHandleForCurrentSpan();
};

exports.sdk = tracing.sdk;

exports.setLogger = function setLogger(_logger) {
  serverlessLogger.init({ logger: _logger });
};

exports.opentracing = tracing.opentracing;
