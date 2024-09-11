/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

// eslint-disable-next-line import/order
const environmentUtil = require('./environment');
const uninstrumented = require('./uninstrumentedHttp');

const constants = require('./constants');
let logger = require('./console_logger');
const crypto = require('crypto');
const layerExtensionHostname = 'localhost';
const layerExtensionPort = process.env.INSTANA_LAYER_EXTENSION_PORT
  ? Number(process.env.INSTANA_LAYER_EXTENSION_PORT)
  : 7365;

let useLambdaExtension = false;
let isLambdaRequest = false;

const timeoutEnvVar = 'INSTANA_TIMEOUT';
let defaultTimeout = 500;
const layerExtensionTimeout = process.env.INSTANA_LAMBDA_EXTENSION_TIMEOUT_IN_MS
  ? Number(process.env.INSTANA_LAMBDA_EXTENSION_TIMEOUT_IN_MS)
  : 500;
let backendTimeout = defaultTimeout;

const proxyEnvVar = 'INSTANA_ENDPOINT_PROXY';
let proxyAgent;

let propagateErrorsUpstream = false;
let warningsHaveBeenLogged = false;

const disableCaCheckEnvVar = 'INSTANA_DISABLE_CA_CHECK';
const disableCaCheck = process.env[disableCaCheckEnvVar] === 'true';

const getRequestId = () => crypto.randomBytes(16).toString('hex');
const requests = {};

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
    `Both ${proxyEnvVar} and ${environmentUtil.sendUnencryptedEnvVar} are set, but this combination is not supported.` +
      ' Requests to the Instana back end will not be routed via a proxy server.'
  );
}

let hostHeader;

exports.init = function init(
  identityProvider,
  _logger,
  _stopSendingOnFailure,
  _propagateErrorsUpstream,
  _defaultTimeout,
  _useLambdaExtension,
  _isLambdaRequest = false
) {
  propagateErrorsUpstream = _propagateErrorsUpstream == null ? false : _propagateErrorsUpstream;
  defaultTimeout = _defaultTimeout == null ? defaultTimeout : _defaultTimeout;
  useLambdaExtension = _useLambdaExtension;
  backendTimeout = defaultTimeout;
  isLambdaRequest = _isLambdaRequest;

  if (process.env[timeoutEnvVar]) {
    backendTimeout = parseInt(process.env[timeoutEnvVar], 10);
    if (isNaN(backendTimeout) || backendTimeout < 0) {
      logger.warn(
        `The value of ${timeoutEnvVar} (${process.env[timeoutEnvVar]}) cannot be parsed to a valid numerical value. ` +
          `Will fall back to the default timeout (${defaultTimeout} ms).`
      );
      backendTimeout = defaultTimeout;
    }
  }

  if (identityProvider) {
    hostHeader = identityProvider.getHostHeader();
    if (hostHeader == null) {
      hostHeader = 'nodejs-serverless';
    }
  } else {
    hostHeader = 'nodejs-serverless';
  }

  if (_logger) {
    logger = _logger;
  }

  // Heartbeat is only for the AWS Lambda extension
  // IMPORTANT: the @instana/aws-lambda package will not
  //            send data once. It can happen all the time till the Lambda handler dies!
  //            SpanBuffer sends data asap and when the handler is finished the rest is sent.
  if (useLambdaExtension) {
    scheduleLambdaExtensionHeartbeatRequest();
  }
};

exports.setLogger = function setLogger(_logger) {
  logger = _logger;
};

/**
 * "finalLambdaRequest":
 * When using AWS Lambda, we send metrics and spans together
 * using the function "sendBundle" at the end of the invocation - before the AWS Lambda
 * runtime might freeze the process. The span buffer sends data reguarly using `sendSpans`.
 */
exports.sendBundle = function sendBundle(bundle, finalLambdaRequest, callback) {
  const requestId = getRequestId();
  logger.debug(`${requestId} Sending bundle to Instana (no. of spans: ${bundle?.spans?.length ?? 'unknown'})`);
  logger.debug(`First span is ${JSON.stringify(bundle.spans[0])}`);
  send('/bundle', bundle, finalLambdaRequest, callback, 0, requestId);
};

exports.sendMetrics = function sendMetrics(metrics, callback) {
  const requestId = getRequestId();
  logger.debug(`${requestId} Sending metrics to Instana (no. of metrics: ${metrics.length})`);
  send('/metrics', metrics, false, callback, 0, requestId);
};

exports.sendSpans = function sendSpans(spans, callback) {
  const requestId = getRequestId();
  logger.debug(`${requestId} Sending spans to Instana (no. of spans: ${spans.length})`);

  logger.debug(`First span is ${JSON.stringify(spans[0])}`);
  send('/traces', spans, false, callback, 0, requestId);
};

let heartbeatInterval;
function scheduleLambdaExtensionHeartbeatRequest() {
  const executeHeartbeat = () => {
    logger.debug('Executing Heartbeat request to Lambda extension.');
    const startTime = Date.now();

    const req = uninstrumented.http.request(
      {
        hostname: layerExtensionHostname,
        port: layerExtensionPort,
        path: '/heartbeat',
        method: 'POST',
        Connection: 'close',
        // This sets a timeout for establishing the socket connection, see setTimeout below for a timeout for an
        // idle connection after the socket has been opened.
        timeout: layerExtensionTimeout
      },
      res => {
        if (res.statusCode === 200) {
          logger.debug('The Instana Lambda extension Heartbeat request has succeeded.');
        } else {
          handleHeartbeatError(
            new Error(
              `The Instana Lambda extension Heartbeat request has returned an unexpected status code: ${res.statusCode}`
            )
          );
        }

        res.once('data', () => {
          // we need to register the handlers to avoid running into a timeout
        });

        res.once('end', () => {
          const endTime = Date.now();
          const duration = endTime - startTime;
          logger.debug(`Took ${duration}ms to receive response from extension`);
        });
      }
    );

    req.once('finish', () => {
      const endTime = Date.now();
      const duration = endTime - startTime;
      logger.debug(`Took ${duration}ms to send data to extension`);
    });

    function handleHeartbeatError(e) {
      // Make sure we do not try to talk to the Lambda extension again.
      useLambdaExtension = false;
      clearInterval(heartbeatInterval);

      logger.debug(
        'The Instana Lambda extension Heartbeat request did not succeed. Falling back to talking to the Instana back ' +
          'end directly.',
        e
      );
    }

    req.once('error', e => {
      // req.destroyed indicates that we have run into a timeout and have already handled the timeout error.
      if (req.destroyed) {
        return;
      }

      handleHeartbeatError(e);
    });

    // Handle timeouts that occur after connecting to the socket (no response from the extension).
    req.setTimeout(layerExtensionTimeout, () => {
      handleHeartbeatError(new Error('The Lambda extension Heartbeat request timed out.'));

      // Destroy timed out request manually as mandated in https://nodejs.org/api/http.html#event-timeout.
      if (req && !req.destroyed) {
        try {
          destroyRequest(req);
        } catch (e) {
          // ignore
        }
      }
    });

    req.end();
  };

  // call immediately
  executeHeartbeat();

  // NOTE: it is fine to use interval, because the req timeout is 300ms and the interval is 500
  heartbeatInterval = setInterval(executeHeartbeat, 500);
  heartbeatInterval.unref();
}

function getTransport(localUseLambdaExtension) {
  if (localUseLambdaExtension) {
    // The Lambda extension is always HTTP without TLS on localhost.
    return uninstrumented.http;
  } else {
    return environmentUtil.sendUnencrypted ? uninstrumented.http : uninstrumented.https;
  }
}

function getBackendTimeout(localUseLambdaExtension) {
  return localUseLambdaExtension ? layerExtensionTimeout : backendTimeout;
}

function send(resourcePath, payload, finalLambdaRequest, callback, tries, requestId) {
  let callbackWasCalled = false;
  const handleCallback = args => {
    if (callbackWasCalled) return;
    callbackWasCalled = true;
    callback(args);
  };

  // We need a local copy of the global useLambdaExtension variable, otherwise it might be changed concurrently by
  // scheduleLambdaExtensionHeartbeatRequest. But we need to remember the value at the time we _started_ the request to
  // decide whether to fall back to sending to the back end directly or give up sending data completely.
  let localUseLambdaExtension = useLambdaExtension;

  if (!warningsHaveBeenLogged) {
    warningsHaveBeenLogged = true;
    if (environmentUtil.sendUnencrypted) {
      logger.error(
        `${environmentUtil.sendUnencryptedEnvVar} is set, which means that all traffic to Instana is send ` +
          'unencrypted via plain HTTP, not via HTTPS. This will effectively make that traffic public. This setting ' +
          'should never be used in production.'
      );
    }

    if (disableCaCheck) {
      logger.warn(
        `${disableCaCheckEnvVar} is set, which means that the server certificate will not be verified against ` +
          'the list of known CAs. This makes your service vulnerable to MITM attacks when connecting to Instana. ' +
          'This setting should never be used in production, unless you use our on-premises product and are unable to ' +
          'operate the Instana back end with a certificate with a known root CA.'
      );
    }
  }

  // prepend backend's path if the configured URL has a path component
  const requestPath =
    localUseLambdaExtension || environmentUtil.getBackendPath() === '/'
      ? resourcePath
      : environmentUtil.getBackendPath() + resourcePath;

  // serialize the payload object
  const serializedPayload = JSON.stringify(payload);

  const options = {
    hostname: localUseLambdaExtension ? layerExtensionHostname : environmentUtil.getBackendHost(),
    port: localUseLambdaExtension ? layerExtensionPort : environmentUtil.getBackendPort(),
    path: requestPath,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(serializedPayload),
      Connection: 'close',
      [constants.xInstanaHost]: hostHeader,
      [constants.xInstanaKey]: environmentUtil.getInstanaAgentKey()
    },
    rejectUnauthorized: !disableCaCheck
  };

  logger.debug(
    `${requestId} Request options (${options.hostname}, ${options.port}, ${options.path}, 
    ${options.headers['Content-Length']}).`
  );

  // This timeout is for **inactivity** - Backend sends no data at all
  // So if the timeout is set to 500ms, it does not mean that the request will be aborted after 500ms
  options.timeout = getBackendTimeout(localUseLambdaExtension);

  if (proxyAgent && !localUseLambdaExtension) {
    options.agent = proxyAgent;
  }

  let req;
  const skipWaitingForHttpResponse = !proxyAgent && !localUseLambdaExtension;
  const transport = getTransport(localUseLambdaExtension);
  const start = Date.now();

  if (skipWaitingForHttpResponse) {
    // If the Lambda extension is not available to act as a proxy between the Lambda and serverless-acceptor (and
    // additionally, if no user-configured proxy is in place), we change the HTTP handling a bit to reduce the time
    // we keep the Lamdba alive: We deliberately do not pass a callback when calling https.request but instead we pass
    // the callback to req.end. This way, we do not wait for the HTTP _response_, but we still make sure the request
    // data is written to the network  completely. This reduces the delay we add to the Lambda execution time to
    // report metrics and traces quite a bit. The (acceptable) downside is that we do not get to examine the response
    // for HTTP status codes.

    req = transport.request(options);
  } else {
    // If (a) our Lambda extension is available, or if (b) a user-provided proxy is in use, we do *not* apply the
    // optimization outlined above. Instead, we opt for the more traditional workflow of waiting until the HTTP response
    // has been received. For the case (a) it is simply not necessary because the request to the Lambda extension is
    // happening on localhost and will be very fast. For case (b), the reason is that some proxies interact in weird
    // ways with the HTTP flow.
    //
    // See the req.end(serializedPayload) call below, too. In the no-extension/no-proxy case, that call has the callback
    // to end the processing. Otherwise, the callback is provided here to http.request().
    req = transport.request(options, () => {
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

  if (isLambdaRequest) {
    requests[requestId] = req;
  }

  req.on('response', res => {
    const { statusCode } = res;

    if (statusCode >= 200 && statusCode < 300) {
      logger.debug(`${requestId} Received response from Instana (${requestPath}).`);
    } else {
      logger.debug(`${requestId} Received response from Instana has been failed (${requestPath}).`);
    }

    logger.debug(`${requestId} Received HTTP status code ${statusCode} from Instana (${requestPath}).`);
    logger.debug(`${requestId} Sending and receiving data in ms: ${Date.now() - start} ms.`);

    delete requests[requestId];
  });

  // See above for the difference between the timeout attribute in the request options and handling the 'timeout'
  // event. This only adds a read timeout after the connection has been established and we need the timout attribute
  // in the request options additionally for protection against cases where *connecting* to the socket takes too long,
  // see https://nodejs.org/api/http.html#http_request_settimeout_timeout_callback:
  // > Once a socket is assigned to this request **and is connected**
  // > socket.setTimeout() will be called.
  req.on('timeout', () => {
    logger.debug(`${requestId} Timeout while sending data to Instana (${requestPath}).`);

    if (isLambdaRequest) {
      delete requests[requestId];
    }

    onTimeout(
      localUseLambdaExtension,
      req,
      resourcePath,
      payload,
      finalLambdaRequest,
      handleCallback,
      tries,
      requestId
    );
  });

  req.on('error', e => {
    logger.debug(`${requestId} Error while sending data to Instana (${requestPath}).`, e);

    if (isLambdaRequest) {
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

    if (localUseLambdaExtension) {
      // This is a failure from talking to the Lambda extension on localhost. Most probably it is simply not available
      // because @instana/aws-lambda has been installed as a normal npm dependency instead of using Instana's
      // Lambda layer. We use this failure as a signal to not try to the extension again and instead fall back to
      // talking to serverless-acceptor directly. We also immediately retry the current request with that new downstream
      // target in place.
      logger.debug(
        `${requestId} Could not connect to the Instana Lambda extension. 
        Falling back to talking to the Instana back end directly.`
      );

      clearInterval(heartbeatInterval);

      if (tries >= 1) {
        // Retry the request immediately, this time sending it to serverless-acceptor directly.
        logger.debug(
          `${requestId} Giving up with the extension...trying to send data to Instana serverless BE directly.`
        );
        useLambdaExtension = localUseLambdaExtension = false;
        return send(resourcePath, payload, finalLambdaRequest, callback, 0, requestId);
      }

      logger.debug(`${requestId} Retrying...`);
      send(resourcePath, payload, finalLambdaRequest, callback, tries + 1, requestId);
    } else {
      if (!propagateErrorsUpstream) {
        if (proxyAgent) {
          logger.warn(
            `${requestId} Could not send traces and metrics to Instana. Could not connect to the configured proxy ` +
              `${process.env[proxyEnvVar]}.`
          );
        } else {
          logger.warn(
            `${requestId} Could not send traces and metrics to Instana. The Instana back end seems to be unavailable.`
          );
        }
      }

      if (tries >= 1) {
        logger.debug(`${requestId} Giving up...`);
        return handleCallback(propagateErrorsUpstream ? e : undefined);
      }

      logger.debug(`${requestId} Retrying...`);
      send(resourcePath, payload, finalLambdaRequest, callback, tries + 1, requestId);
    }
  });

  // This only indicates that the request has been successfully send! Independent of the response!
  req.on('finish', () => {
    logger.debug(`${requestId} The request data has been successfully send to Instana.`);
    if (useLambdaExtension && finalLambdaRequest) {
      clearInterval(heartbeatInterval);
    }
  });

  if (skipWaitingForHttpResponse) {
    // NOTE: When the callback of `.end` is called, the data was successfully send to the server.
    //       That does not mean the server has responded in any way!
    req.end(serializedPayload, () => {
      if (isLambdaRequest && finalLambdaRequest) {
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

function onTimeout(
  localUseLambdaExtension,
  req,
  resourcePath,
  payload,
  finalLambdaRequest,
  handleCallback,
  tries,
  requestId
) {
  if (localUseLambdaExtension) {
    // This is a timeout from talking to the Lambda extension on localhost. Most probably it is simply not available
    // because @instana/aws-lambda has been installed as a normal npm dependency instead of using Instana's
    // Lambda layer. We use this failure as a signal to not try to the extension again and instead fall back to
    // talking to serverless-acceptor directly. We also immediately retry the current request with that new downstream
    // target in place.
    logger.debug(
      `${requestId} Request timed out while trying to talk to Instana Lambda extension. 
      Falling back to talking to the Instana bback end directly.`
    );

    clearInterval(heartbeatInterval);

    if (req && !req.destroyed) {
      try {
        destroyRequest(req);
      } catch (e) {
        // ignore
      }
    }

    if (tries >= 1) {
      // Retry the request immediately, this time sending it to serverless-acceptor directly.
      logger.debug(
        `${requestId} Giving up with the extension...trying to send data to Instana serverless BE directly.`
      );
      useLambdaExtension = localUseLambdaExtension = false;
      return send(resourcePath, payload, finalLambdaRequest, handleCallback, 0, requestId);
    }

    logger.debug(`${requestId} Retrying...`);
    send(resourcePath, payload, finalLambdaRequest, handleCallback, tries + 1, requestId);
  } else {
    // We need to destroy the request manually, otherwise it keeps the runtime running (and timing out) when
    // (a) the wrapped Lambda handler uses the callback API, and
    // (b) context.callbackWaitsForEmptyEventLoop = false is not set.
    // Also, the Node.js documentation mandates to destroy the request manually in case of a timeout. See
    // https://nodejs.org/api/http.html#http_event_timeout.
    if (req && !req.destroyed) {
      try {
        destroyRequest(req);
      } catch (e) {
        // ignore
      }
    }

    const message = `${requestId} Could not send traces and metrics to Instana. 
      The Instana back end did not respond in the configured timeout
      of ${backendTimeout} ms. The timeout can be configured by setting the environment variable ${timeoutEnvVar}.`;

    if (!propagateErrorsUpstream) {
      logger.warn(message);
    }

    if (tries >= 1) {
      logger.debug(`${requestId} Giving up...`);
      return handleCallback();
    }

    logger.debug(`${requestId} Retrying...`);
    send(resourcePath, payload, finalLambdaRequest, handleCallback, tries + 1, requestId);
  }
}

function cleanupRequests() {
  Object.keys(requests).forEach(key => {
    const requestToCleanup = requests[key];
    // When the Node.js process is frozen while the request is pending, and then thawed later,
    // this can trigger a stale, bogus timeout event (because from the perspective of the freshly thawed Node.js
    // runtime, the request has been pending and inactive since a long time).
    // To avoid that, we remove all listeners
    // (including the timeout listener) on the request. Since the Lambda runtime will be frozen afterwards (or
    // reused for a different, unrelated invocation), it is safe to assume that
    // we are no longer interested in any
    // events emitted by the request or the underlying socket.
    requestToCleanup.removeAllListeners();

    // We need to have a listener for errors that ignores everything, otherwise aborting the request/socket will
    // produce an "Unhandled 'error' event"
    requestToCleanup.once('error', () => {});

    // Finally, abort the request because from our end we are no longer interested in the response and we also do
    // not want to let pending IO actions linger in the event loop. This will also call request.destoy and
    // req.socket.destroy() internally.
    destroyRequest(requestToCleanup);
  });
}

function destroyRequest(req) {
  req.destroy();
}
