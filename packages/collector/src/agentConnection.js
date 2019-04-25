'use strict';

var atMostOnce = require('@instana/core').util.atMostOnce;
var buffer = require('@instana/core').util.buffer;
var fs = require('fs');
var http = require('@instana/core').uninstrumentedHttp.http;
var pathUtil = require('path');
var propertySizes = require('@instana/core').util.propertySizes;

var logger;
logger = require('./logger').getLogger('agentConnection', function(newLogger) {
  logger = newLogger;
});

var agentOpts = require('./agent/opts');
var pidStore = require('./pidStore');
var cmdline = require('./cmdline');

var cpuSetFileContent = getCpuSetFileContent();

// How many extra characters are to be reserved for the inode and
// file descriptor fields in the collector announce cycle.
var paddingForInodeAndFileDescriptor = 200;

var netLinkHasBeenRequired;
var netLink;

var maxContentLength = 1024 * 1024 * 5;
var maxContentErrorHasBeenLogged = false;

exports.announceNodeCollector = function announceNodeCollector(cb) {
  cb = atMostOnce('callback for announceNodeCollector', cb);

  var payload = {
    // the PID of this process (might be relative to the container or the root PID namespace)
    pid: pidStore.pid,

    // indicates whether the in-process collector is sending the PID it has in its own namespace or the PID from a
    // parent namespace
    pidFromParentNS: pidStore.pid != process.pid, // eslint-disable-line eqeqeq

    // We might need to add the propery `inode` to this JSON payload in the `socket` event handler - that is, *after*
    // the Content-Length handler has already been sent. This is problematic because but we do not know how long (as in
    // characters) the file descriptor and inode will be. Still, we need to set a correct Content-Length header before
    // initiating the request. This is what this spacer is used for.
    //
    // We reserve <paddingForInodeAndFileDescriptor> extra characters for the variable length content. Any unused
    // characters will be filled up with whitespace before the payload is actually sent.
    spacer: ''
  };

  var processCmdline = cmdline.getCmdline();
  if (processCmdline.name && processCmdline.args) {
    payload.name = processCmdline.name;
    payload.args = processCmdline.args;
  }
  if (cpuSetFileContent) {
    payload.cpuSetFileContent = cpuSetFileContent;
  }

  var payloadStr = JSON.stringify(payload);
  var contentLength = buffer.fromString(payloadStr, 'utf8').length + paddingForInodeAndFileDescriptor;

  var req = http.request(
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
    function(res) {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        cb(new Error('Announce to agent failed with status code ' + res.statusCode));
        return;
      }

      res.setEncoding('utf8');
      var responseBody = '';
      res.on('data', function(chunk) {
        responseBody += chunk;
      });
      res.on('end', function() {
        cb(null, responseBody);
      });
    }
  );

  req.setTimeout(agentOpts.requestTimeout, function onTimeout() {
    cb(new Error('Announce request to agent failed due to timeout'));
    req.abort();
  });

  req.on('error', function(err) {
    cb(new Error('Announce request to agent failed due to: ' + err.message));
  });

  req.on('socket', function(socket) {
    if (socket._handle != null && socket._handle.fd != null) {
      payload.fd = String(socket._handle.fd);

      try {
        payload.inode = fs.readlinkSync(pathUtil.join('/proc', String(process.pid), 'fd', payload.fd));
      } catch (e) {
        logger.debug('Failed to retrieve inode for file descriptor %s: %s', payload.fd, e.message);
      }
    }

    // Ensure that the payload length matches the length transmitted via the
    // Content-Length header.
    payloadStr = JSON.stringify(payload);
    var payloadStrBufferLength = buffer.fromString(payloadStr, 'utf8').length;
    if (payloadStrBufferLength < contentLength) {
      var missingChars = contentLength - payloadStrBufferLength;
      for (var i = 0; i < missingChars; i++) {
        payload.spacer += ' ';
      }
    }

    req.write(buffer.fromString(JSON.stringify(payload), 'utf8'));
    req.end();
  });
};

exports.checkWhetherAgentIsReadyToAcceptData = function checkWhetherAgentIsReadyToAcceptData(cb) {
  checkWhetherResponseForPathIsOkay('/com.instana.plugin.nodejs.' + pidStore.pid, cb);
};

function checkWhetherResponseForPathIsOkay(path, cb) {
  cb = atMostOnce('callback for checkWhetherResponseForPathIsOkay', cb);

  var req = http.request(
    {
      host: agentOpts.host,
      port: agentOpts.port,
      path: path,
      agent: http.agent,
      method: 'HEAD'
    },
    function(res) {
      cb(199 < res.statusCode && res.statusCode < 300);
      res.resume();
    }
  );

  req.setTimeout(agentOpts.requestTimeout, function onTimeout() {
    cb(false);
    req.abort();
  });

  req.on('error', function() {
    cb(false);
  });

  req.end();
}

exports.sendDataToAgent = function sendDataToAgent(data, cb) {
  cb = atMostOnce('callback for sendDataToAgent', cb);

  sendData('/com.instana.plugin.nodejs.' + pidStore.pid, data, function(err, body) {
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

exports.sendSpans = function sendSpans(spans, cb) {
  var callback = atMostOnce('callback for sendSpans', function(err, responseBody) {
    if (err && !maxContentErrorHasBeenLogged && err instanceof PayloadTooLargeError) {
      logLargeSpans(spans);
    }
    cb(err, responseBody);
  });

  sendData('/com.instana.plugin.nodejs/traces.' + pidStore.pid, spans, callback, true);
};

exports.sendAgentResponseToAgent = function sendAgentResponseToAgent(messageId, response, cb) {
  cb = atMostOnce('callback for sendAgentResponseToAgent', cb);

  sendData(
    '/com.instana.plugin.nodejs/response.' + pidStore.pid + '?messageId=' + encodeURIComponent(messageId),
    response,
    cb
  );
};

function sendData(path, data, cb, ignore404) {
  cb = atMostOnce('callback for sendData: ' + path, cb);
  if (ignore404 === undefined) {
    ignore404 = false;
  }

  var payload = JSON.stringify(data);

  logger.debug({ payload: data }, 'Sending payload to %s', path);
  // manually turn into a buffer to correctly identify content-length
  payload = buffer.fromString(payload, 'utf8');
  if (payload.length > maxContentLength) {
    var error = new PayloadTooLargeError(
      'Request payload is too large. Will not send data to agent. (POST ' + path + ')'
    );
    return setImmediate(cb.bind(null, error));
  }

  var req = http.request(
    {
      host: agentOpts.host,
      port: agentOpts.port,
      path: path,
      method: 'POST',
      agent: http.agent,
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'Content-Length': payload.length
      }
    },
    function(res) {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        if (!(ignore404 && res.statusCode === 404)) {
          cb(new Error('Failed to send data to agent via POST ' + path + '. Got status code ' + res.statusCode));
          return;
        }
      }

      res.setEncoding('utf8');
      var responseBody = '';
      res.on('data', function(chunk) {
        responseBody += chunk;
      });
      res.on('end', function() {
        cb(null, responseBody);
      });
    }
  );

  req.setTimeout(agentOpts.requestTimeout, function onTimeout() {
    cb(new Error('Failed to send data to agent via POST ' + path + '. Ran into a timeout.'));
    req.abort();
  });

  req.on('error', function(err) {
    cb(new Error('Send data to agent via POST ' + path + '. Request failed: ' + err.message));
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
 */
exports.reportUncaughtExceptionToAgentSync = function reportUncaughtExceptionToAgentSync(eventData, spans) {
  sendRequestsSync([
    {
      path: '/com.instana.plugin.nodejs/traces.' + pidStore.pid,
      data: spans
    },
    {
      path: '/com.instana.plugin.generic.event',
      data: eventData
    }
  ]);
};

/**
 * Sends multiple HTTP POST requests to the agent. This function is synchronous, that is, it blocks the event loop!
 *
 * YOU MUST NOT USE THIS FUNCTION, except for the one use case where it is actually required to block the event loop
 * (reporting an uncaught exception tot the agent in the process.on('uncaughtException') handler).
 */
function sendRequestsSync(requests) {
  // only try to require optional dependency netlinkwrapper once
  if (!netLinkHasBeenRequired) {
    netLinkHasBeenRequired = true;
    try {
      netLink = require('netlinkwrapper')();
    } catch (requireNetlinkError) {
      logger.warn(
        'Failed to require optional dependency netlinkwrapper, uncaught exception will not be reported to Instana.'
      );
    }
  }
  if (!netLink) {
    return;
  }

  var port = agentOpts.port;
  if (typeof port !== 'number') {
    try {
      port = parseInt(port, 10);
    } catch (nonNumericPortError) {
      logger.warn('Detected non-numeric port configuration value %s, uncaught exception will not be reported.', port);
      return;
    }
  }

  try {
    netLink.connect(port, agentOpts.host);
    netLink.blocking(false);
    requests.forEach(function(request) {
      sendHttpPostRequestSync(port, request.path, request.data);
    });
  } catch (netLinkError) {
    logger.warn('Failed to report uncaught exception due to network error.', { error: netLinkError });
  } finally {
    try {
      netLink.disconnect();
    } catch (ignoreDisconnectError) {
      logger.debug('Failed to disconnect after trying to report uncaught exception.');
    }
  }
}

/**
 * Sends a single, synchronous HTTP POST request to the agent. This function is synchronous, that is, it blocks the
 * event loop!
 *
 * YOU MUST NOT USE THIS FUNCTION, except for the one use case where it is actually required to block the event loop
 * (reporting an uncaught exception tot the agent in the process.on('uncaughtException') handler).
 */
function sendHttpPostRequestSync(port, path, data) {
  logger.debug({ payload: data }, 'Sending payload synchronously to %s', path);
  try {
    var payload = JSON.stringify(data);
    var payloadLength = buffer.fromString(payload, 'utf8').length;
  } catch (payloadSerializationError) {
    logger.warn('Could not serialize payload, uncaught exception will not be reported.', {
      error: payloadSerializationError
    });
    return;
  }

  // prettier-ignore
  netLink.write(
    'POST ' + path + ' HTTP/1.1\u000d\u000a' +
    'Host: ' + agentOpts.host + '\u000d\u000a' +
    'Content-Type: application/json; charset=UTF-8\u000d\u000a' +
    'Content-Length: ' + payloadLength + '\u000d\u000a' +
    '\u000d\u000a' + // extra CRLF before body
    payload
  );
}

function getCpuSetFileContent() {
  try {
    var cpuSetPath = '/proc/' + process.pid + '/cpuset';
    var content = fs.readFileSync(cpuSetPath, { encoding: 'utf-8' });
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

function PayloadTooLargeError(message) {
  Error.captureStackTrace(this, this.constructor);
  this.name = this.constructor.name;
  this.message = message;
}

function logLargeSpans(spans) {
  maxContentErrorHasBeenLogged = true;
  var topFiveLargestSpans = spans
    .map(function(span) {
      return {
        span: span,
        length: JSON.stringify(span)
      };
    })
    .sort(function(s1, s2) {
      return s2.length - s1.length;
    })
    .slice(0, 4)
    .map(function(s) {
      return (
        'span name: ' +
        s.span.n +
        ', largest attribute: ' +
        propertySizes(s.span)
          .sort(function(p1, p2) {
            return p2.length - p1.length;
          })
          .slice(0, 1)
          .map(function(p) {
            return p.property + ' (' + p.length + ' bytes)';
          })
      );
    });
  logger.warn(
    'A batch of spans has been rejected because they are too large to be sent to the agent. Here are the top five ' +
      'largest spans of the rejected batch and their largest attribute. This detailed information will only be ' +
      'logged once. ' +
      topFiveLargestSpans.join('; ')
  );
}
