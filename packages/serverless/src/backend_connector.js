/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

// eslint-disable-next-line import/order
const environmentUtil = require('./environment');
const uninstrumented = require('./uninstrumentedHttp');
const constants = require('./constants');
const layerExtensionHostname = 'localhost';
const layerExtensionPort = process.env.INSTANA_LAYER_EXTENSION_PORT
  ? Number(process.env.INSTANA_LAYER_EXTENSION_PORT)
  : 7365;

const timeoutEnvVar = 'INSTANA_TIMEOUT';

// NOTE: The heartbeat is usually really, really fast (<30ms).
const layerExtensionHeartbeatTimeout = 100;

// NOTE: The initial heartbeat can be very slow when the Lambda is in cold start.
const initialLayerExtensionHeartbeatTimeout = 2000;

// NOTE: When lambda is in cold start, the communication between the handler
//       and the extension can take a while. We need to have a bigger timeout
//       for the initially.
const initialLayerExtensionRequestTimeout = 2000;

const layerExtensionRequestTimeout = process.env.INSTANA_LAMBDA_EXTENSION_TIMEOUT_IN_MS
  ? Number(process.env.INSTANA_LAMBDA_EXTENSION_TIMEOUT_IN_MS)
  : 500;

const proxyEnvVar = 'INSTANA_ENDPOINT_PROXY';
const disableCaCheckEnvVar = 'INSTANA_DISABLE_CA_CHECK';
const disableCaCheck = process.env[disableCaCheckEnvVar] === 'true';
let proxyAgent;
let warningsHaveBeenLogged = false;
let firstRequestToExtension = true;

const defaults = {
  config: {},
  identityProvider: null,
  isLambdaRequest: false,
  backendTimeout: 500,
  useLambdaExtension: false,
  retries: false
};

let logger;
let options;
let hostHeader;

/**
 * Most of the logs are debug logs in the backend connector, because
 * on serverless we do not want to log too much.
 * If the debug mode is enabled, we want to add a request id to the instana
 * logs because the AWS runtime freezes requests and they are waking up
 * as soon as the next request is coming in. With the request id we can
 * identify the logs of a single request.
 *
 * Due to performance reasons, we do not want to generate a request id
 * in the non debug mode.
 */
const getRequestId = () => {
  if (logger && logger.isInDebugMode && logger.isInDebugMode()) {
    // Although the usage of "Math.random()"" is not allowed for being FedRamp compliant, but
    // this use case is a non secure workflow.
    return `instana_${Date.now().toString(36) + Math.random().toString(36).slice(2)}`;
  }

  return 'instana';
};

const requests = {};

exports.init = function init(opts) {
  options = Object.assign(defaults, opts);
  logger = options.config.logger;

  // TODO: refactor environment.js into serverless normalize config
  //       and move the following code into the new unit
  if (process.env[proxyEnvVar] && !environmentUtil.sendUnencrypted) {
    const proxyUrl = process.env[proxyEnvVar];
    logger.info(
      `The environment variable ${proxyEnvVar} is set. Requests to the Instana back end will be routed via a proxy ` +
        `server: ${proxyUrl}.`
    );

    const { HttpsProxyAgent } = require('https-proxy-agent');
    proxyAgent = new HttpsProxyAgent(proxyUrl);
  } else if (process.env[proxyEnvVar] && environmentUtil.sendUnencrypted) {
    logger.warn(
      `Both ${proxyEnvVar} and ${environmentUtil.sendUnencryptedEnvVar} are set, ` +
        'but this combination is not supported.' +
        ' Requests to the Instana back end will not be routed via a proxy server.'
    );
  }

  // TODO: refactor environment.js into serverless normalize config
  //       and move the following code into the new unit
  if (process.env[timeoutEnvVar]) {
    options.backendTimeout = parseInt(process.env[timeoutEnvVar], 10);

    if (isNaN(options.backendTimeout) || options.backendTimeout < 0) {
      logger.warn(
        `The value of ${timeoutEnvVar} (${process.env[timeoutEnvVar]}) cannot be parsed to a valid numerical value. ` +
          `Will fall back to the default timeout (${defaults.backendTimeout} ms).`
      );

      options.backendTimeout = defaults.backendTimeout;
    }
  }

  if (options.identityProvider) {
    hostHeader = options.identityProvider.getHostHeader();
    if (hostHeader == null) {
      hostHeader = 'nodejs-serverless';
    }
  } else {
    hostHeader = 'nodejs-serverless';
  }

  // Heartbeat is only for the AWS Lambda extension
  // IMPORTANT: the @instana/aws-lambda package will not
  //            send data once. It can happen all the time till the Lambda handler dies!
  //            SpanBuffer sends data asap and when the handler is finished the rest is sent.
  if (options.useLambdaExtension) {
    scheduleLambdaExtensionHeartbeatRequest();
  }
};

/**
 * "finalLambdaRequest":
 * When using AWS Lambda, we send metrics and spans together
 * using the function "sendBundle" at the end of the invocation - before the AWS Lambda
 * runtime might freeze the process. The span buffer sends data reguarly using `sendSpans`.
 */
exports.sendBundle = function sendBundle(bundle, finalLambdaRequest, callback) {
  const requestId = getRequestId();
  logger.debug(`[${requestId}] Sending bundle to Instana (no. of spans: ${bundle?.spans?.length ?? 'unknown'})`);
  send({ resourcePath: '/bundle', payload: bundle, finalLambdaRequest, callback, requestId });
};

exports.sendMetrics = function sendMetrics(metrics, callback) {
  const requestId = getRequestId();
  logger.debug(`[${requestId}] Sending metrics to Instana (no. of metrics: ${metrics?.plugins?.length})`);
  send({ resourcePath: '/metrics', payload: metrics, finalLambdaRequest: false, callback, requestId });
};

exports.sendSpans = function sendSpans(spans, callback) {
  const requestId = getRequestId();
  logger.debug(`[${requestId}] Sending spans to Instana (no. of spans: ${spans?.length})`);
  send({ resourcePath: '/traces', payload: spans, finalLambdaRequest: false, callback, requestId });
};

let heartbeatInterval;
let heartbeatIsActive = false;
function scheduleLambdaExtensionHeartbeatRequest() {
  const executeHeartbeat = (heartbeatOpts = {}) => {
    if (heartbeatIsActive) {
      return;
    }

    const startTime = Date.now();
    const requestId = getRequestId();

    logger.debug(`[${requestId}] Executing Heartbeat request to Lambda extension.`);
    heartbeatIsActive = true;

    const req = uninstrumented.http.request(
      {
        hostname: layerExtensionHostname,
        port: layerExtensionPort,
        path: '/heartbeat',
        method: 'POST',
        headers: {
          Connection: 'keep-alive'
        }
      },
      res => {
        logger.debug(`[${requestId}] Took ${Date.now() - startTime} ms to send heartbeat to the extension.`);

        if (res.statusCode === 200) {
          logger.debug(`[${requestId}] The Instana Lambda extension heartbeat request has succeeded.`);
        } else {
          logger.debug(
            `[${requestId}] The Instana Lambda extension heartbeat request has failed. Status Code: ${res.statusCode}`
          );

          handleHeartbeatError();
        }

        res.once('data', () => {
          // we need to register the handlers to avoid running into a timeout
          // because the request expects to receive body data
        });

        res.once('end', () => {
          const endTime = Date.now();
          const duration = endTime - startTime;
          logger.debug(`[${requestId}] Took ${duration}ms to receive response from extension`);

          heartbeatIsActive = false;
        });
      }
    );

    req.once('error', e => {
      logger.debug(`[${requestId}] The Heartbeat request did not succeed.`, e);

      // req.destroyed indicates that we have run into a timeout and have
      // already handled the timeout error.
      if (req.destroyed) {
        return;
      }

      handleHeartbeatError();
    });

    req.setTimeout(heartbeatOpts.heartbeatTimeout, () => {
      logger.debug(`[${requestId}] Heartbeat request timed out.`);

      // req.destroyed indicates that we have run into a timeout and have already handled the timeout error.
      if (req.destroyed) {
        return;
      }

      handleHeartbeatError();
    });

    function handleHeartbeatError() {
      logger.warn(`[${requestId}] Heartbeat request failed. Falling back to the serverless acceptor instead.`);

      options.useLambdaExtension = false;
      clearInterval(heartbeatInterval);
      cleanupRequest(req);
      heartbeatIsActive = false;
    }

    req.end();
  };

  // call immediately
  // timeout is bigger because of possible coldstart
  executeHeartbeat({ heartbeatTimeout: initialLayerExtensionHeartbeatTimeout });

  heartbeatInterval = setInterval(() => {
    logger.debug('Heartbeat interval is alive.');
    executeHeartbeat({ heartbeatTimeout: layerExtensionHeartbeatTimeout });
  }, 300);

  heartbeatInterval.unref();
}

function getTransport() {
  if (options.useLambdaExtension) {
    // The Lambda extension is always HTTP without TLS on localhost.
    return uninstrumented.http;
  } else {
    return environmentUtil.sendUnencrypted ? uninstrumented.http : uninstrumented.https;
  }
}

function getBackendTimeout() {
  if (options.useLambdaExtension) {
    if (firstRequestToExtension) {
      firstRequestToExtension = false;
      return initialLayerExtensionRequestTimeout;
    } else {
      return layerExtensionRequestTimeout;
    }
  }

  return options.backendTimeout;
}

function send({ resourcePath, payload, finalLambdaRequest, callback, tries, requestId }) {
  let callbackWasCalled = false;
  const handleCallback = args => {
    if (callbackWasCalled) return;
    callbackWasCalled = true;
    callback(args);
  };

  if (tries === undefined) {
    tries = 0;
  }

  if (!warningsHaveBeenLogged) {
    warningsHaveBeenLogged = true;
    if (environmentUtil.sendUnencrypted) {
      logger.warn(
        `[${requestId}] ${environmentUtil.sendUnencryptedEnvVar} is set, which means that all traffic ` +
          'to Instana is send ' +
          'unencrypted via plain HTTP, not via HTTPS. This will effectively make that traffic public. This setting ' +
          'should never be used in production.'
      );
    }

    if (disableCaCheck) {
      logger.warn(
        `[${requestId}] ${disableCaCheckEnvVar} is set, which means that the server certificate will ` +
          'not be verified against ' +
          'the list of known CAs. This makes your service vulnerable to MITM attacks when connecting to Instana. ' +
          'This setting should never be used in production, unless you use our on-premises product and are unable to ' +
          'operate the Instana back end with a certificate with a known root CA.'
      );
    }
  }

  // prepend backend's path if the configured URL has a path component
  const requestPath =
    options.useLambdaExtension || environmentUtil.getBackendPath() === '/'
      ? resourcePath
      : environmentUtil.getBackendPath() + resourcePath;

  // serialize the payload object
  const serializedPayload = JSON.stringify(payload);

  const reqOptions = {
    hostname: options.useLambdaExtension ? layerExtensionHostname : environmentUtil.getBackendHost(),
    port: options.useLambdaExtension ? layerExtensionPort : environmentUtil.getBackendPort(),
    path: requestPath,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(serializedPayload),
      Connection: 'keep-alive',
      [constants.xInstanaHost]: hostHeader,
      [constants.xInstanaKey]: environmentUtil.getInstanaAgentKey()
    },
    rejectUnauthorized: !disableCaCheck
  };

  logger.debug(
    `[${requestId}] Sending trace data to Instana (${reqOptions.hostname}, ${reqOptions.port}, ${reqOptions.path},
    ${reqOptions.headers?.['Content-Length']}).`
  );

  // This timeout is for **inactivity** - Backend sends no data at all
  // So if the timeout is set to 500ms, it does not mean that the request will be aborted after 500ms
  reqOptions.timeout = getBackendTimeout(options.useLambdaExtension);

  if (proxyAgent && !options.useLambdaExtension) {
    reqOptions.agent = proxyAgent;
  }

  let req;
  const skipWaitingForHttpResponse = !proxyAgent && !options.useLambdaExtension;
  const transport = getTransport(options.useLambdaExtension);
  const start = Date.now();

  if (skipWaitingForHttpResponse) {
    // If the Lambda extension is not available to act as a proxy between the Lambda and serverless-acceptor (and
    // additionally, if no user-configured proxy is in place), we change the HTTP handling a bit to reduce the time
    // we keep the Lamdba alive: We deliberately do not pass a callback when calling https.request but instead we pass
    // the callback to req.end. This way, we do not wait for the HTTP _response_, but we still make sure the request
    // data is written to the network  completely. This reduces the delay we add to the Lambda execution time to
    // report metrics and traces quite a bit. The (acceptable) downside is that we do not get to examine the response
    // for HTTP status codes.

    req = transport.request(reqOptions);
  } else {
    // If (a) our Lambda extension is available, or if (b) a user-provided proxy is in use, we do *not* apply the
    // optimization outlined above. Instead, we opt for the more traditional workflow of waiting until the HTTP response
    // has been received. For the case (a) it is simply not necessary because the request to the Lambda extension is
    // happening on localhost and will be very fast. For case (b), the reason is that some proxies interact in weird
    // ways with the HTTP flow.
    //
    // See the req.end(serializedPayload) call below, too. In the no-extension/no-proxy case, that call has the callback
    // to end the processing. Otherwise, the callback is provided here to http.request().
    req = transport.request(reqOptions, () => {
      // When the Node.js process is frozen while the request is pending, and then thawed later,
      // this can trigger a stale, bogus timeout event (because from the perspective of the freshly thawed Node.js
      // runtime, the request has been pending and inactive since a long time). To avoid that, we remove all listeners
      // (including the timeout listener) on the request. Since the Lambda runtime will be frozen afterwards (or
      // reused for a different, unrelated invocation), it is safe to assume that  we are no longer interested in any
      // events emitted by the request or the underlying socket.
      if (finalLambdaRequest) {
        cleanupRequests();
      }

      handleCallback();
    });
  }

  if (options.isLambdaRequest) {
    requests[requestId] = req;
  }

  req.on('response', res => {
    const { statusCode } = res;

    if (statusCode >= 200 && statusCode < 300) {
      logger.debug(`${requestId} Received response from Instana (${requestPath}).`);
    } else {
      logger.debug(`${requestId} Received response from Instana has been failed (${requestPath}).`);
    }

    logger.debug(`[${requestId}] Received HTTP status code ${statusCode} from Instana (${requestPath}).`);
    logger.debug(`[${requestId}] Sending and receiving data to Instana took: ${Date.now() - start} ms.`);

    cleanupRequest(req);
    delete requests[requestId];
  });

  // See above for the difference between the timeout attribute in the request options and handling the 'timeout'
  // event. This only adds a read timeout after the connection has been established and we need the timout attribute
  // in the request options additionally for protection against cases where *connecting* to the socket takes too long,
  // see https://nodejs.org/api/http.html#http_request_settimeout_timeout_callback:
  // > Once a socket is assigned to this request **and is connected**
  // > socket.setTimeout() will be called.
  req.on('timeout', () => {
    logger.debug(`[${requestId}] Timeout while sending data to Instana (${requestPath}).`);

    if (options.isLambdaRequest) {
      delete requests[requestId];
    }

    onTimeout(req, resourcePath, payload, finalLambdaRequest, handleCallback, tries, requestId);
  });

  req.on('error', e => {
    logger.debug(`[${requestId}] Error while sending data to Instana (${requestPath}): ${e?.message} ${e?.stack}`);

    if (options.isLambdaRequest) {
      delete requests[requestId];
    }

    // CASE: we manually destroy streams, skip these errors
    // Otherwise we will produce `Error: socket hang up` errors in the logs
    // We already print the warning that a timeout happened
    // https://nodejs.org/api/http.html#requestdestroyed
    if (req.destroyed) {
      // CASE: connection refused e.g. proxy or BE is not up, but we need to check if the cb was called
      handleCallback();
      return;
    }

    if (options.useLambdaExtension) {
      // This is a failure from talking to the Lambda extension on localhost. Most probably it is simply not available
      // because @instana/aws-lambda has been installed as a normal npm dependency instead of using Instana's
      // Lambda layer. We use this failure as a signal to not try to the extension again and instead fall back to
      // talking to serverless-acceptor directly. We also immediately retry the current request with that new downstream
      // target in place.
      logger.debug(`[${requestId}] Could not connect to the Instana Lambda extension (tries: ${tries}).`);

      if (options.retries === false || tries >= 1) {
        clearInterval(heartbeatInterval);

        // Retry the request immediately, this time sending it to serverless-acceptor directly.
        logger.warn(
          // eslint-disable-next-line max-len
          `[${requestId}] Trying to send data to Instana serverless acceptor instead because the Lambda extension cannot be reached in time.`
        );

        options.useLambdaExtension = false;
        return send({ resourcePath, payload, finalLambdaRequest, callback, tries: 0, requestId });
      }

      logger.debug(`[${requestId}] Retrying...`);
      send({ resourcePath, payload, finalLambdaRequest, callback, tries: tries + 1, requestId });
    } else {
      if (proxyAgent) {
        logger.warn(
          `[${requestId}] Could not send trace data to ${resourcePath}. Could not connect to the configured proxy ` +
            `${process.env[proxyEnvVar]}.` +
            `${e?.message} ${e?.stack}`
        );
      } else {
        logger.warn(
          `[${requestId}] Could not send trace data to ${resourcePath}. ` +
            `The Instana back end seems to be unavailable. ${e?.message} , ${e?.stack}`
        );
      }

      if (options.retries === false || tries >= 1) {
        logger.debug(`[${requestId}] Giving up...`);
        return handleCallback(e);
      }

      logger.debug(`[${requestId}] Retrying...`);
      send({ resourcePath, payload, finalLambdaRequest, callback, tries: tries + 1, requestId });
    }
  });

  // This only indicates that the request has been successfully send! Independent of the response!
  req.on('finish', () => {
    logger.debug(
      // eslint-disable-next-line max-len
      `[${requestId}] The trace data have been successfully sent to Instana.`
    );

    if (options.useLambdaExtension && finalLambdaRequest) {
      clearInterval(heartbeatInterval);
    }
  });

  if (skipWaitingForHttpResponse) {
    // NOTE: When the callback of `.end` is called, the data was successfully send to the server.
    //       That does not mean the server has responded in any way!
    req.end(serializedPayload, () => {
      if (options.isLambdaRequest && finalLambdaRequest) {
        cleanupRequests();
      }

      // We finish as soon as the request has been flushed, without waiting for the response.
      handleCallback();
    });
  } else {
    // See above for why the proxy case has no callback on req.end. Instead, it uses the more traditional callback on
    // request creation.
    req.end(serializedPayload);
  }
}

function onTimeout(req, resourcePath, payload, finalLambdaRequest, handleCallback, tries, requestId) {
  if (options.useLambdaExtension) {
    // This is a timeout from talking to the Lambda extension on localhost. Most probably it is simply not available
    // because @instana/aws-lambda has been installed as a normal npm dependency instead of using Instana's
    // Lambda layer. We use this failure as a signal to not try to the extension again and instead fall back to
    // talking to serverless acceptor directly. We also immediately retry the current request with that new downstream
    // target in place.
    logger.debug(`[${requestId}] Request timed out while trying to talk to Instana Lambda extension.`);

    cleanupRequest(req);

    // CASE: It could be that a parallel request or the heartbeat already set useLambdaExtension to false.
    if (options.retries === false || tries >= 1) {
      clearInterval(heartbeatInterval);

      // Retry the request immediately, this time sending it to serverless acceptor directly.
      logger.warn(
        `[${requestId}] Trying to send data to Instana serverless acceptor instead because the Lambda extension ` +
          'cannot be reached in time.'
      );

      options.useLambdaExtension = false;
      return send({ resourcePath, payload, finalLambdaRequest, callback: handleCallback, tries: 0, requestId });
    }

    logger.debug(`[${requestId}] Retrying...`);
    send({ resourcePath, payload, finalLambdaRequest, callback: handleCallback, tries: tries + 1, requestId });
  } else {
    // We need to destroy the request manually, otherwise it keeps the runtime running
    // (and timing out) when:
    // (a) the wrapped Lambda handler uses the callback API, and
    // (b) context.callbackWaitsForEmptyEventLoop = false is not set.
    // Also, the Node.js documentation mandates to destroy the request manually in case of a timeout. See
    // https://nodejs.org/api/http.html#http_event_timeout.
    cleanupRequest(req);

    const message =
      `[${requestId}] Could not send data to ${resourcePath}. The Instana back end did not respond ` +
      'in the configured timeout ' +
      `of ${options.backendTimeout} ms. The timeout can be configured by ` +
      `setting the environment variable ${timeoutEnvVar}.`;

    logger.warn(`[${requestId}] ${message}`);

    if (options.retries === false || tries >= 1) {
      logger.debug(`[${requestId}] Giving up...`);
      return handleCallback();
    }

    logger.debug(`[${requestId}] Retrying...`);
    send({ resourcePath, payload, finalLambdaRequest, callback: handleCallback, tries: tries + 1, requestId });
  }
}

function cleanupRequests() {
  Object.keys(requests).forEach(key => {
    const requestToCleanup = requests[key];
    cleanupRequest(requestToCleanup);
  });
}

function cleanupRequest(req) {
  // When the Node.js process is frozen while the request is pending, and then thawed later,
  // this can trigger a stale, bogus timeout event (because from the perspective of the freshly thawed Node.js
  // runtime, the request has been pending and inactive since a long time).
  // To avoid that, we remove all listeners
  // (including the timeout listener) on the request. Since the Lambda runtime will be frozen afterwards (or
  // reused for a different, unrelated invocation), it is safe to assume that
  // we are no longer interested in any
  // events emitted by the request or the underlying socket.
  req.removeAllListeners();

  // We need to have a listener for errors that ignores everything, otherwise aborting the request/socket will
  // produce an "Unhandled 'error' event"
  req.once('error', () => {});

  // Finally, abort the request because from our end we are no longer interested in the response and we also do
  // not want to let pending IO actions linger in the event loop. This will also call request.destroy and
  // req.socket.destroy() internally.
  destroyRequest(req);
}

function destroyRequest(req) {
  // Destroy timed out request manually as mandated in
  // https://nodejs.org/api/http.html#event-timeout.
  if (req && !req.destroyed) {
    try {
      req.destroy();
    } catch (e) {
      // ignore
    }
  }
}
