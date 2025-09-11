/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2015
 */

'use strict';

const { util, uninstrumentedHttp, uninstrumentedFs: fs } = require('@instana/core');
const pathUtil = require('path');
const circularReferenceRemover = require('./util/removeCircular');
const agentOpts = require('./agent/opts');
const cmdline = require('./cmdline');

/** @typedef {import('@instana/core/src/core').InstanaBaseSpan} InstanaBaseSpan */

/** @type {import('@instana/core/src/core').GenericLogger} */
let logger;
/** @type {{ pid: number }} */
let pidStore;

// How many extra characters are to be reserved for the inode and
// file descriptor fields in the collector announce cycle.
const paddingForInodeAndFileDescriptor = 200;

// NOTE: The agent/sensor has a limit of 49mb.
//       We had 5mb for a few years, but we were running into PayloadTooLargeError for
//       profiles. We increase it to 20mb and see if that helps.
const maxContentLength = 1024 * 1024 * 20;
let maxContentErrorHasBeenLogged = false;

const http = uninstrumentedHttp.http;
let isConnected = false;

/** @type {string | null} */
let cpuSetFileContent = null;

/**
 * @param {import('@instana/core/src/config').InstanaConfig} config
 * @param {any} _pidStore
 */
exports.init = function init(config, _pidStore) {
  logger = config.logger;
  pidStore = _pidStore;

  cmdline.init(config);
  cpuSetFileContent = getCpuSetFileContent();
};

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
 * @typedef {Object} Event
 * @property {string} [title]
 * @property {string} [text]
 * @property {string} [plugin]
 * @property {number} [pid]
 * @property {string} [path]
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
 * @param {(err: Error, rawResponse?: string) => void} callback
 */
exports.announceNodeCollector = function announceNodeCollector(callback) {
  const cb = util.atMostOnce('callback for announceNodeCollector', callback);

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

  let wasCalled = false;
  const handleCallback = function () {
    if (!wasCalled) {
      wasCalled = true;
      cb.apply(null, arguments);
    }
  };

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
        handleCallback(new Error(`Announce to agent failed with status code ${res.statusCode}`));
        return;
      }

      res.setEncoding('utf8');
      let responseBody = '';
      res.on('data', chunk => {
        responseBody += chunk;
      });
      res.on('end', () => {
        handleCallback(null, responseBody);
      });
    }
  );

  req.setTimeout(agentOpts.requestTimeout, function onTimeout() {
    handleCallback(new Error('Announce request to agent failed due to timeout'));
    req.destroy();
  });

  req.on('error', err => {
    handleCallback(new Error(`Announce request to agent failed due to: ${err.message}`));
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
        logger.debug(`Failed to retrieve inode for file descriptor ${payload.fd}: ${e?.message}`);
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
  cb = util.atMostOnce('callback for checkWhetherResponseForPathIsOkay', cb);

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
    req.destroy();
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
  cb = util.atMostOnce('callback for sendMetrics', cb);

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
  const callback = util.atMostOnce('callback for sendSpans', err => {
    if (err && !maxContentErrorHasBeenLogged && err instanceof PayloadTooLargeError) {
      logLargeSpans(spans);
    } else if (err) {
      const spanInfo = getSpanLengthInfo(spans);
      logger.debug(`Failed to send: ${JSON.stringify(spanInfo)}`);
    } else {
      const spanInfo = getSpanLengthInfo(spans);
      logger.debug(`Successfully sent: ${JSON.stringify(spanInfo)}`);
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
  const callback = util.atMostOnce('callback for sendProfiles', err => {
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
 * @param {Event} eventData
 * @param {(...args: *) => *} cb
 */
exports.sendEvent = function sendEvent(eventData, cb) {
  const callback = util.atMostOnce('callback for sendEvent', (err, responseBody) => {
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
  /** @type {Event} */
  const event = {
    plugin: 'com.instana.forge.infrastructure.runtime.nodejs.NodeJsRuntimePlatform',
    pid: pidStore.pid,
    code,
    duration: 660000, // 11 minutes
    category
  };

  const callback = util.atMostOnce('callback for sendAgentMonitoringEvent', (err, responseBody) => {
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
  cb = util.atMostOnce('callback for sendAgentResponseToAgent', cb);

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
  const callback = util.atMostOnce('callback for sendTracingMetricsToAgent', err => {
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
  cb = util.atMostOnce(`callback for sendData: ${path}`, cb);

  const payloadAsString = JSON.stringify(data, circularReferenceRemover());
  if (typeof logger.trace === 'function') {
    logger.trace(`Sending data to ${path}.`);
  } else {
    logger.debug(`Sending data to ${path}, ${agentOpts}`);
  }

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
    req.destroy();
  });

  req.on('error', err => {
    cb(new Error(`Send data to agent via POST ${path}. Request failed: ${err.message}`));
  });

  req.write(payload);
  req.end();
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
      logger.warn(`cpuset file could not be read. Reason: ${err?.message}`);
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
        `span name: ${s.span.n}, largest attribute: ${util
          .propertySizes(s.span)
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

/**
 * @typedef {InstanaBaseSpan} Span Span
 * @property {number} [k] kind
 */

/**
 * Returning type for the function getSpanLengthInfo
 * @typedef {Object.<string, number>} CountBySpanType
 */

/**
 * @param {Span[]} spans
 * @returns {CountBySpanType}
 */
function getSpanLengthInfo(spans) {
  /** @type {Object.<number, string>} */
  const spanMapping = {
    1: 'entrySpans',
    2: 'exitSpans',
    3: 'intermediateSpans'
  };

  /**
   * @param {CountBySpanType} acc
   * @param {Span} item
   */
  const reducer = (acc, item) => {
    const label = spanMapping[item?.k];
    if (label) {
      acc[label] = (acc[label] || 0) + 1;
    }
    return acc;
  };

  const countBySpanType = spans.reduce(reducer, {});

  return countBySpanType;
}
