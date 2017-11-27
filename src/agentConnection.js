'use strict';

var pathUtil = require('path');
var fs = require('fs');

var logger = require('./logger').getLogger('agentConnection');
var atMostOnce = require('./util/atMostOnce');
var agentOpts = require('./agent/opts');
var buffer = require('./util/buffer');
var pidStore = require('./pidStore');
var cmdline = require('./cmdline');
var http = require('./http');

// How many extra characters are to be reserved for the inode and
// file descriptor fields in the sensor announce cycle.
var paddingForInodeAndFileDescriptor = 200;

exports.announceNodeSensor = function announceNodeSensor(cb) {
  cb = atMostOnce('callback for announceNodeSensor', cb);

  var payload = {
    pid: pidStore.pid,

    // We need to add properties to this JSON payload for which don't know
    // yet how large they are going to be. Specifically, we don't know how
    // long (as in characters) the file descriptor and inode are. Still,
    // we need to set a correct Content-Length header. This is what this
    // spacer is used for.
    //
    // We reserve <paddingForInodeAndFileDescriptor> extra characters for
    // content. Any unused characters will be filled up with whitespace
    // before the payload is send.
    spacer: ''
  };

  var processCmdline = cmdline.getCmdline();
  if (processCmdline.name && processCmdline.args) {
    payload.name = processCmdline.name;
    payload.args = processCmdline.args;
  }

  var payloadStr = JSON.stringify(payload);
  var contentLength = buffer.fromString(payloadStr, 'utf8').length + paddingForInodeAndFileDescriptor;

  var req = http.request({
    host: agentOpts.host,
    port: agentOpts.port,
    path: '/com.instana.plugin.nodejs.discovery',
    method: 'PUT',
    agent: http.agent,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json; charset=UTF-8',
      'Content-Length': contentLength
    }
  }, function(res) {
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
  });

  req.setTimeout(agentOpts.requestTimeout, function onTimeout() {
    cb(new Error('Announce request to agent failed due to timeout'));
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
  checkWhetherResponseForPathIsOkay(
    '/com.instana.plugin.nodejs.' + pidStore.pid,
    cb
  );
};


function checkWhetherResponseForPathIsOkay(path, cb) {
  cb = atMostOnce('callback for checkWhetherResponseForPathIsOkay', cb);

  var req = http.request({
    host: agentOpts.host,
    port: agentOpts.port,
    path: path,
    agent: http.agent,
    method: 'HEAD',
  }, function(res) {
    cb(199 < res.statusCode && res.statusCode < 300);
    res.resume();
  });

  req.setTimeout(agentOpts.requestTimeout, function onTimeout() {
    cb(false);
  });

  req.on('error', function() {
    cb(false);
  });

  req.end();
}


exports.sendDataToAgent = function sendDataToAgent(data, cb) {
  cb = atMostOnce('callback for sendDataToAgent', cb);

  sendData(
    '/com.instana.plugin.nodejs.' + pidStore.pid,
    data,
    function(err, body) {
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
    }
  );
};


exports.sendSpansToAgent = function sendSpansToAgent(spans, cb) {
  cb = atMostOnce('callback for sendSpansToAgent', cb);

  sendData(
    '/com.instana.plugin.nodejs/traces.' + pidStore.pid,
    spans,
    cb,
    true
  );
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
  logger.debug({payload: data}, 'Sending payload to %s', path);
  // manually turn into a buffer to correctly identify content-length
  payload = buffer.fromString(payload, 'utf8');

  var req = http.request({
    host: agentOpts.host,
    port: agentOpts.port,
    path: path,
    method: 'POST',
    agent: http.agent,
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'Content-Length': payload.length
    }
  }, function(res) {
    if (res.statusCode < 200 || res.statusCode >= 300) {
      if (!(ignore404 && res.statusCode === 404)) {
        cb(new Error('Failed to send data to agent with status code ' + res.statusCode));
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
  });

  req.setTimeout(agentOpts.requestTimeout, function onTimeout() {
    cb(new Error('Timeout while trying to send data to agent via path: ' + path));
  });

  req.on('error', function(err) {
    cb(new Error('Send data to agent (path: ' + path + ') request failed: ' + err.message));
  });

  req.write(payload);
  req.end();
}
