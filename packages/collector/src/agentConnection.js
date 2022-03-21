/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2015
 */

'use strict';

const { atMostOnce } = require('@instana/core').util;
const fs = require('fs');
const { http } = require('@instana/core').uninstrumentedHttp;
const pathUtil = require('path');
const { propertySizes } = require('@instana/core').util;
const childProcess = require('child_process');

/** @typedef {import('@instana/core/src/tracing/cls').InstanaBaseSpan} InstanaBaseSpan */

/** @type {import('@instana/core/src/logger').GenericLogger} */
let logger;
logger = require('./logger').getLogger('agentConnection', newLogger => {
  logger = newLogger;
});

const circularReferenceRemover = require('./util/removeCircular');
const agentOpts = require('./agent/opts');
const pidStore = require('./pidStore');
const cmdline = require('./cmdline');

const cpuSetFileContent = getCpuSetFileContent();

// How many extra characters are to be reserved for the inode and
// file descriptor fields in the collector announce cycle.
const paddingForInodeAndFileDescriptor = 200;

const maxContentLength = 1024 * 1024 * 5;
let maxContentErrorHasBeenLogged = false;

let isConnected = false;

exports.AgentEventSeverity = {
  SLI_EVENT: -4,
  INFO: -2,
  CHANGE: -1,
  WARNING: 5,
  CRITICAL: 10
};

/**
 * Options: SLI_EVENT (-4, deprecated), INFO (-2), CHANGE (-1), WARNING (5), CRITICAL (10)
 * @typedef {-4 | -2 | -1 | 5 | 10 | number} ProblemSeverity
 * */

/**
 * @typedef {Object} AgentConnectionEvent
 * @property {string} [title]
 * @property {string} [text]
 * @property {string} [plugin]
 * @property {number} [pid]
 * @property {number} [id]
 * @property {string} [code]
 * @property {string} [category]
 * @property {number} [timestamp]
 * @property {number} [duration]
 * @property {ProblemSeverity} [severity]
 */

/**
 * @typedef {Object} AgentConnectionPayload
 * @property {number} pid
 * @property {string} [inode]
 * @property {string} [fd]
 * @property {boolean} pidFromParentNS
 * @property {string} spacer
 * @property {string} [name]
 * @property {string | Array.<*>} [args]
 * @property {string} [cpuSetFileContent]
 */

/**
 * @param {(err: Error, rawResponse?: string) => void} cb
 */
exports.announceNodeCollector = function announceNodeCollector(cb) {
  cb = atMostOnce('callback for announceNodeCollector', cb);

  /** @type {AgentConnectionPayload} */
  const payload = {
    // the PID of this process (might be relative to the container or the root PID namespace)
    pid: pidStore.pid,

    // indicates whether the in-process collector is sending the PID it has in its own namespace or the PID from a
    // parent namespace
    pidFromParentNS: pidStore.pid != process.pid, // eslint-disable-line eqeqeq

    // We might need to add the property `inode` to this JSON payload in the `socket` event handler - that is, *after*
    // the Content-Length handler has already been sent. This is problematic because but we do not know how long (as in
    // characters) the file descriptor and inode will be. Still, we need to set a correct Content-Length header before
    // initiating the request. This is what this spacer is used for.
    //
    // We reserve <paddingForInodeAndFileDescriptor> extra characters for the variable length content. Any unused
    // characters will be filled up with whitespace before the payload is actually sent.
    spacer: ''
  };

  const processCmdline = cmdline.getCmdline();
  if (processCmdline.name && processCmdline.args) {
    payload.name = processCmdline.name;
    payload.args = processCmdline.args;
  }
  if (cpuSetFileContent) {
    payload.cpuSetFileContent = cpuSetFileContent;
  }

  let payloadStr = JSON.stringify(payload);
  const contentLength = Buffer.from(payloadStr, 'utf8').length + paddingForInodeAndFileDescriptor;

  const req = http.request(
    {
      host: agentOpts.host,
      port: agentOpts.port,
      path: '/com.instana.plugin.nodejs.discovery',
      method: 'PUT',
      agent: http.agent,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=UTF-8',
        'Content-Length': contentLength
      }
    },
    res => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        cb(new Error(`Announce to agent failed with status code ${res.statusCode}`));
        return;
      }

      res.setEncoding('utf8');
      let responseBody = '';
      res.on('data', chunk => {
        responseBody += chunk;
      });
      res.on('end', () => {
        cb(null, responseBody);
      });
    }
  );

  req.setTimeout(agentOpts.requestTimeout, function onTimeout() {
    cb(new Error('Announce request to agent failed due to timeout'));
    req.abort();
  });

  req.on('error', err => {
    cb(new Error(`Announce request to agent failed due to: ${err.message}`));
  });

  req.on('socket', socket => {
    // @ts-ignore - Property '_handle' does not exist on type 'Socket'
    if (socket._handle != null && socket._handle.fd != null) {
      // @ts-ignore - Property '_handle' does not exist on type 'Socket'
      payload.fd = String(socket._handle.fd);

      try {
        const linkPathPrefix = `${pathUtil.join('/proc', String(process.pid), 'fd')}/`;
        const linkPath = pathUtil.join(linkPathPrefix, payload.fd);
        payload.inode = fs.readlinkSync(linkPath);
        if (typeof payload.inode === 'string' && payload.inode.indexOf(linkPathPrefix) === 0) {
          // Node.js apps built with Bazel need special handling here, since Bazel's node-patches turn the result of
          // readlinkSync into an absolute path. See
          // https://github.com/bazelbuild/rules_nodejs/blob/5.3.0/packages/node-patches/src/fs.ts#L226
          // We work around that by removing those bogus leading path segments. The Instana agent will try to match on
          // the inode value without any path prefix, so sending a fully qualified path would break the announcement.
          payload.inode = payload.inode.substring(linkPathPrefix.length);
        }
      } catch (e) {
        logger.debug('Failed to retrieve inode for file descriptor %s: %s', payload.fd, e.message);
      }
    }

    // Ensure that the payload length matches the length transmitted via the
    // Content-Length header.
    payloadStr = JSON.stringify(payload);
    const payloadStrBufferLength = Buffer.from(payloadStr, 'utf8').length;
    if (payloadStrBufferLength < contentLength) {
      const missingChars = contentLength - payloadStrBufferLength;
      for (let i = 0; i < missingChars; i++) {
        payload.spacer += ' ';
      }
    }

    req.write(Buffer.from(JSON.stringify(payload), 'utf8'));
    req.end();
  });
};

/**
 * @param {(ready: boolean) => void} cb
 */
exports.checkWhetherAgentIsReadyToAcceptData = function checkWhetherAgentIsReadyToAcceptData(cb) {
  checkWhetherResponseForPathIsOkay(`/com.instana.plugin.nodejs.${pidStore.pid}`, cb);
};

/**
 * @param {string} path
 * @param {(...args: *) => *} cb
 */
function checkWhetherResponseForPathIsOkay(path, cb) {
  cb = atMostOnce('callback for checkWhetherResponseForPathIsOkay', cb);

  const req = http.request(
    {
      host: agentOpts.host,
      port: agentOpts.port,
      path,
      agent: http.agent,
      method: 'HEAD'
    },
    res => {
      isConnected = 199 < res.statusCode && res.statusCode < 300;
      cb(isConnected);
      res.resume();
    }
  );

  req.setTimeout(agentOpts.requestTimeout, function onTimeout() {
    isConnected = false;
    cb(isConnected);
    req.abort();
  });

  req.on('error', () => {
    isConnected = false;
    cb(isConnected);
  });

  req.end();
}

/**
 * @param {Object<string, *>} data
 * @param {(...args: *) => *} cb
 */
exports.sendMetrics = function sendMetrics(data, cb) {
  cb = atMostOnce('callback for sendMetrics', cb);

  sendData(`/com.instana.plugin.nodejs.${pidStore.pid}`, data, (err, body) => {
    if (err) {
      cb(err, null);
    } else {
      try {
        // 2016-09-11
        // Older sensor versions will not repond with a JSON
        // structure. Support a smooth update path.
        body = JSON.parse(body);
      } catch (e) {
        body = [];
      }

      cb(null, body);
    }
  });
};

/**
 *
 * @param {Array.<InstanaBaseSpan>} spans
 * @param {(...args: *) => *} cb
 */
exports.sendSpans = function sendSpans(spans, cb) {
  const callback = atMostOnce('callback for sendSpans', err => {
    if (err && !maxContentErrorHasBeenLogged && err instanceof PayloadTooLargeError) {
      logLargeSpans(spans);
    }
    cb(err);
  });

  sendData(`/com.instana.plugin.nodejs/traces.${pidStore.pid}`, spans, callback, true);
};

/**
 * @param {*} profiles
 * @param {(...args: *) => *} cb
 */
exports.sendProfiles = function sendProfiles(profiles, cb) {
  const callback = atMostOnce('callback for sendProfiles', err => {
    if (err && err instanceof PayloadTooLargeError) {
      logger.warn('Profiles are too too large to be sent.');
    } else if (err && err.statusCode === 404) {
      logger.warn(
        'You have enabled autoProfiling but the Instana agent this process reports to does not yet support ' +
          'autoProfiling for Node.js. Please update the Instana agent. (Node.js Sensor 1.2.14 or newer is required.)'
      );
    }
    cb(err);
  });

  sendData(`/com.instana.plugin.nodejs/profiles.${pidStore.pid}`, profiles, callback);
};

/**
 * @param {AgentConnectionEvent} eventData
 * @param {(...args: *) => *} cb
 */
exports.sendEvent = function sendEvent(eventData, cb) {
  const callback = atMostOnce('callback for sendEvent', (err, responseBody) => {
    cb(err, responseBody);
  });

  sendData('/com.instana.plugin.generic.event', eventData, callback);
};

/**
 * @param {string} code
 * @param {string} category
 * @param {(...args: *) => *} cb
 */
exports.sendAgentMonitoringEvent = function sendAgentMonitoringEvent(code, category, cb) {
  /** @type {AgentConnectionEvent} */
  const event = {
    plugin: 'com.instana.forge.infrastructure.runtime.nodejs.NodeJsRuntimePlatform',
    pid: pidStore.pid,
    code,
    duration: 660000, // 11 minutes
    category
  };

  const callback = atMostOnce('callback for sendAgentMonitoringEvent', (err, responseBody) => {
    cb(err, responseBody);
  });

  sendData('/com.instana.plugin.generic.agent-monitoring-event', event, callback);
};

/**
 * @param {string} messageId
 * @param {*} response
 * @param {(...args: *) => *} cb
 */
exports.sendAgentResponseToAgent = function sendAgentResponseToAgent(messageId, response, cb) {
  cb = atMostOnce('callback for sendAgentResponseToAgent', cb);

  sendData(
    `/com.instana.plugin.nodejs/response.${pidStore.pid}?messageId=${encodeURIComponent(messageId)}`,
    response,
    cb
  );
};

/**
 * @param {import('@instana/core/src/tracing').TracingMetrics} tracingMetrics
 * @param {(...args: *) => *} cb
 */
exports.sendTracingMetricsToAgent = function sendTracingMetricsToAgent(tracingMetrics, cb) {
  const callback = atMostOnce('callback for sendTracingMetricsToAgent', err => {
    cb(err);
  });

  sendData('/tracermetrics', tracingMetrics, callback);
};

/**
 * @param {string} path
 * @param {*} data
 * @param {(...args: *) => *} cb
 * @param {boolean} [ignore404]
 * @returns
 */
function sendData(path, data, cb, ignore404 = false) {
  cb = atMostOnce(`callback for sendData: ${path}`, cb);

  const payloadAsString = JSON.stringify(data, circularReferenceRemover());
  logger.debug('Sending data to %s', path);

  // Convert payload to a buffer to correctly identify content-length ahead of time.
  const payload = Buffer.from(payloadAsString, 'utf8');
  if (payload.length > maxContentLength) {
    const error = new PayloadTooLargeError(`Request payload is too large. Will not send data to agent. (POST ${path})`);
    return setImmediate(cb.bind(null, error));
  }

  const req = http.request(
    {
      host: agentOpts.host,
      port: agentOpts.port,
      path,
      method: 'POST',
      agent: http.agent,
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'Content-Length': payload.length
      }
    },
    res => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        if (res.statusCode !== 404 || !ignore404) {
          const statusCodeError = new Error(
            `Failed to send data to agent via POST ${path}. Got status code ${res.statusCode}.`
          );
          // @ts-ignore
          statusCodeError.statusCode = res.statusCode;
          cb(statusCodeError);
          return;
        }
      }

      res.setEncoding('utf8');
      let responseBody = '';
      res.on('data', chunk => {
        responseBody += chunk;
      });
      res.on('end', () => {
        cb(null, responseBody);
      });
    }
  );

  req.setTimeout(agentOpts.requestTimeout, function onTimeout() {
    cb(new Error(`Failed to send data to agent via POST ${path}. Ran into a timeout.`));
    req.abort();
  });

  req.on('error', err => {
    cb(new Error(`Send data to agent via POST ${path}. Request failed: ${err.message}`));
  });

  req.write(payload);
  req.end();
}

/**
 * Sends the given event data and trace data synchronously to the agent via HTTP. This function is synchronous, that is,
 * it blocks the event loop!
 *
 * YOU MUST NOT USE THIS FUNCTION, except for the one use case where it is actually required to block the event loop
 * (reporting an uncaught exception tot the agent in the process.on('uncaughtException') handler).
 *
 * @param {*} eventData
 * @param {Array.<InstanaBaseSpan>} spans
 */
exports.reportUncaughtExceptionToAgentSync = function reportUncaughtExceptionToAgentSync(eventData, spans) {
  sendRequestsSync(
    '/com.instana.plugin.generic.event',
    eventData,
    `/com.instana.plugin.nodejs/traces.${pidStore.pid}`,
    spans
  );
};

/**
 * Sends two HTTP POST requests to the agent. This function is synchronous, that is, it blocks the event loop!
 *
 * YOU MUST NOT USE THIS FUNCTION, except for the one use case where it is actually required to block the event loop
 * (reporting an uncaught exception tot the agent in the process.on('uncaughtException') handler).
 *
 * @param {string} path1
 * @param {Object} data1
 * @param {string} path2
 * @param {Object} data2
 */
function sendRequestsSync(path1, data1, path2, data2) {
  let port = agentOpts.port;
  if (typeof port !== 'number') {
    try {
      port = parseInt(port, 10);
    } catch (nonNumericPortError) {
      logger.warn('Detected non-numeric port configuration value %s, uncaught exception will not be reported.', port);
      return;
    }
  }

  let payload1;
  let payload2;
  try {
    payload1 = JSON.stringify(data1);
    payload2 = JSON.stringify(data2);
  } catch (payloadSerializationError) {
    logger.warn('Could not serialize payload, uncaught exception will not be reported.', {
      error: payloadSerializationError
    });
    return;
  }

  try {
    childProcess.execFileSync(process.execPath, [pathUtil.join(__dirname, 'uncaught', 'syncHttp.js')], {
      env: {
        INSTANA_AGENT_HOST: agentOpts.host,
        INSTANA_AGENT_PORT: String(agentOpts.port),
        PATH1: path1,
        PAYLOAD1: payload1,
        PATH2: path2,
        PAYLOAD2: payload2
      },
      timeout: 400
    });
  } catch (error) {
    logger.warn('Failed to report uncaught exception due to network error.', { error });
  }
}

exports.isConnected = function () {
  return isConnected;
};

function getCpuSetFileContent() {
  try {
    const cpuSetPath = `/proc/${process.pid}/cpuset`;
    const content = fs.readFileSync(cpuSetPath, { encoding: 'utf-8' });
    // paranoid check - if the cpusets file for whatever reason is really big, we don't want to send it to the agent
    // at all.
    if (content && content.length >= 2000) {
      return null;
    }
    return content;
  } catch (err) {
    if (err.code !== 'ENOENT') {
      logger.warn('cpuset file could not be read. Reason: %s', err.message);
    }
    return null;
  }
}

/**
 * @param {string} message
 */
function PayloadTooLargeError(message) {
  Error.captureStackTrace(this, this.constructor);
  this.name = this.constructor.name;
  this.message = message;
}

/**
 *
 * @param {Array.<InstanaBaseSpan>} spans
 */
function logLargeSpans(spans) {
  maxContentErrorHasBeenLogged = true;
  const topFiveLargestSpans = spans
    .map(span => ({
      span,
      length: JSON.stringify(span).length
    }))
    .sort((s1, s2) => s2.length - s1.length)
    .slice(0, 4)
    .map(
      s =>
        `span name: ${s.span.n}, largest attribute: ${propertySizes(s.span)
          .sort((p1, p2) => p2.length - p1.length)
          .slice(0, 1)
          .map(p => `${p.property} (${p.length} bytes)`)}`
    );
  logger.warn(
    // eslint-disable-next-line max-len
    `A batch of spans have been rejected because they are too large to be sent to the agent. Here are the top five largest spans of the rejected batch and their largest attribute. This detailed information will only be logged once. ${topFiveLargestSpans.join(
      '; '
    )}`
  );
}
