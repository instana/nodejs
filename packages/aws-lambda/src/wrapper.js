/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

// eslint-disable-next-line instana/no-unsafe-require
const semver = require('semver');
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
  tracing: {
    forceTransmissionStartingAt: 25,
    transmissionDelay: 100,
    initialTransmissionDelay: 100
  }
};

// Node.js 24+ removed support for callback-based handlers (3 parameters).
const latestRuntime = semver.gte(process.version, '24.0.0');

const logger = serverlessLogger.init();
coreConfig.init(logger);
let config = coreConfig.normalize({}, lambdaConfigDefaults);
let coldStart = true;

// Initialize instrumentations early to allow for require statements after our
// package has been required but before the actual instana.wrap(...) call.
const corepreInit = Date.now();
instanaCore.preInit(config);
logger.debug(`[PERF] instanaCore.preInit took ${Date.now() - corepreInit}ms`);

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
    default: {
      if (latestRuntime) {
        // Required for Node.js 24+: callback is not allowed
        return function handlerAsync(event, context) {
          return shimmedHandler(originalHandler, this, arguments, _config);
        };
      }
      // For Node.js < 24, allow callback-based handlers
      return function handlerCallback(event, context, callback) {
        return shimmedHandler(originalHandler, this, arguments, _config);
      };
    }
  }
};

function shimmedHandler(originalHandler, originalThis, originalArgs, _config) {
  const perfStart = Date.now();
  logger.debug('[PERF] shimmedHandler started');

  const event = originalArgs[0];
  const context = originalArgs[1];
  const lambdaCallback = originalArgs[2];

  // For Node.js 24+, if handler expects callback but runtime doesn't provide one,
  // skip wrapping and return handler directly
  const handlerExpectsCallback = originalHandler?.length >= 3;

  if (latestRuntime && handlerExpectsCallback && !lambdaCallback) {
    // eslint-disable-next-line no-console
    logger.warn(
      `Callback-based Lambda handlers are not supported in Node.js ${process.version}. ` +
        'Skipping Instana instrumentation. Please migrate to async/await or promise-based handlers.'
    );
    return originalHandler.apply(originalThis, originalArgs);
  }

  const arnParseStart = Date.now();
  const arnInfo = arnParser(context);
  logger.debug(`[PERF] ARN parsing took ${Date.now() - arnParseStart}ms`);

  const initStart = Date.now();
  const tracingEnabled = init(event, arnInfo, _config);
  logger.debug(`[PERF] init() took ${Date.now() - initStart}ms`);

  if (!tracingEnabled) {
    return originalHandler.apply(originalThis, originalArgs);
  }

  logger.debug(`[PERF] Pre-handler setup took ${Date.now() - perfStart}ms`);

  // The AWS lambda runtime does not seem to inspect the number of arguments the handler function expects. Instead, it
  // always call the handler with three arguments (event, context, callback), no matter if the handler will use the
  // callback or not. If the handler returns a promise, the runtime uses the that promise's value when it resolves as
  // the result. If the handler calls the callback, that value is used as the result. If the handler does both
  // (return a promise and resolve it _and_ call the callback), it depends on the timing. Whichever happens first
  // dictates the result of the lambda invocation, the later result is ignored. To match this behaviour, we always
  // wrap the given callback _and_ return an instrumented promise.
  //
  // Note: In Node.js 24+, the runtime only passes 2 parameters (event, context) and doesn't provide a callback.
  let handlerHasFinished = false;

  const clsStart = Date.now();
  return tracing.getCls().ns.runPromiseOrRunAndReturn(() => {
    logger.debug(`[PERF] CLS setup took ${Date.now() - clsStart}ms`);

    const traceReadStart = Date.now();
    const traceCorrelationData = triggers.readTraceCorrelationData(event, context);
    logger.debug(`[PERF] readTraceCorrelationData took ${Date.now() - traceReadStart}ms`);
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
      const suppressStart = Date.now();
      tracing.getCls().setTracingLevel('0');
      if (w3cTraceContext) {
        w3cTraceContext.disableSampling();
      }
      logger.debug(`[PERF] Tracing suppression took ${Date.now() - suppressStart}ms`);
    } else {
      const spanStart = Date.now();
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
      const enrichStart = Date.now();
      triggers.enrichSpanWithTriggerData(event, context, entrySpan);
      logger.debug(`[PERF] enrichSpanWithTriggerData took ${Date.now() - enrichStart}ms`);
      logger.debug(`[PERF] Entry span creation took ${Date.now() - spanStart}ms`);
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
      const handlerStart = Date.now();
      logger.debug('[PERF] Calling original handler');
      handlerPromise = originalHandler.apply(originalThis, originalArgs);
      logger.debug(`[PERF] Original handler call took ${Date.now() - handlerStart}ms`);

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
  const initTotalStart = Date.now();

  logger.debug('[PERF] Starting full initialization (cold start)');
  const userConfig = _config || {};

  // CASE: customer provides a custom logger or custom level
  if (userConfig.logger || userConfig.level) {
    const loggerStart = Date.now();
    serverlessLogger.init(userConfig);
    logger.debug(`[PERF] Logger init took ${Date.now() - loggerStart}ms`);
  }

  // NOTE: We SHOULD renormalize because of:
  //         - in-code _config object
  //         - late env variables (less likely)
  //         - custom logger
  //         - we always renormalize unconditionally to ensure safety.
  const configStart = Date.now();
  config = coreConfig.normalize(userConfig, lambdaConfigDefaults);
  logger.debug(`[PERF] Config normalization took ${Date.now() - configStart}ms`);

  if (!config.tracing.enabled) {
    return false;
  }

  const extensionCheckStart = Date.now();
  const useLambdaExtension = shouldUseLambdaExtension();
  logger.debug(`[PERF] Lambda extension check took ${Date.now() - extensionCheckStart}ms`);

  if (useLambdaExtension) {
    logger.info('@instana/aws-lambda will use the Instana Lambda extension to send data to the Instana back end.');
  } else {
    logger.info(
      '@instana/aws-lambda will not use the Instana Lambda extension, but instead send data to the Instana back end ' +
        'directly.'
    );
  }

  const identityStart = Date.now();
  identityProvider.init(arnInfo);
  logger.debug(`[PERF] identityProvider.init took ${Date.now() - identityStart}ms`);

  const triggersStart = Date.now();
  triggers.init(config);
  logger.debug(`[PERF] triggers.init took ${Date.now() - triggersStart}ms`);

  const optimizedTimeout = useLambdaExtension ? 500 : 300;

  const backendStart = Date.now();
  backendConnector.init({
    config,
    identityProvider,
    defaultTimeout: optimizedTimeout,
    useLambdaExtension,
    isLambdaRequest: true,
    // NOTE: We only retry for the extension, because if the extenion is not used, the time to transmit
    //       the data to the serverless acceptor directly takes too long.
    retries: !!useLambdaExtension
  });
  logger.debug(`[PERF] backendConnector.init took ${Date.now() - backendStart}ms`);

  const coreStart = Date.now();
  instanaCore.init(config, backendConnector, identityProvider);
  logger.debug(`[PERF] instanaCore.init took ${Date.now() - coreStart}ms`);

  // After core init, because ssm requires require('@aws-sdk/client-ssm'), which triggers
  // the requireHook + shimmer. Any module which requires another external module has to be
  // initialized after the core.
  const ssmStart = Date.now();
  ssm.init(config, coldStart);
  logger.debug(`[PERF] ssm.init took ${Date.now() - ssmStart}ms`);

  const finalSetupStart = Date.now();
  spanBuffer.setIsFaaS(true);
  captureHeaders.init(config);
  metrics.init(config);
  metrics.activate();
  tracing.activate();
  logger.debug(`[PERF] Final setup (spanBuffer, metrics, tracing) took ${Date.now() - finalSetupStart}ms`);

  logger.debug(`[PERF] TOTAL init() took ${Date.now() - initTotalStart}ms`);
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
  const postHandlerStart = Date.now();
  logger.debug('[PERF] postHandler started');

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

    const processResultStart = Date.now();
    processResult(result, entrySpan);
    logger.debug(`[PERF] processResult took ${Date.now() - processResultStart}ms`);

    entrySpan.d = Date.now() - entrySpan.ts;

    const transmitStart = Date.now();
    entrySpan.transmit();
    logger.debug(`[PERF] entrySpan.transmit took ${Date.now() - transmitStart}ms`);
  }

  const spanBufferStart = Date.now();
  const spans = spanBuffer.getAndResetSpans();
  logger.debug(
    `[PERF] spanBuffer.getAndResetSpans took ${Date.now() - spanBufferStart}ms, spans count: ${spans.length}`
  );

  // We want that all upcoming spans are send immediately to the BE.
  // Span collection happens all the time, but for AWS Lambda sending spans early via spanBuffer
  // is disabled because we cannot use `setTimeout` on AWS Lambda.
  // When the Lambda handler finishes we send all spans via `sendBundle`.
  // If there is any span collected afterwards (async operations), we send them out
  // directly and that's why we set `setTransmitImmediate` to true.
  // We need to rework the default behavior via https://jsw.ibm.com/browse/INSTA-13498
  spanBuffer.setTransmitImmediate(true);

  const metricsStart = Date.now();
  const metricsData = metrics.gatherData();
  logger.debug(`[PERF] metrics.gatherData took ${Date.now() - metricsStart}ms`);

  const metricsPayload = {
    plugins: [{ name: 'com.instana.plugin.aws.lambda', entityId: identityProvider.getEntityId(), data: metricsData }]
  };

  const sendStart = Date.now();
  logger.debug('[PERF] Calling sendToBackend');
  sendToBackend({
    spans,
    metricsPayload,
    finalLambdaRequest: true,
    callback: () => {
      logger.debug(`[PERF] sendToBackend completed in ${Date.now() - sendStart}ms`);
      logger.debug(`[PERF] TOTAL postHandler took ${Date.now() - postHandlerStart}ms`);
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
