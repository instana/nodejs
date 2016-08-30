'use strict';

var http = require('./http');

var logger = require('./logger').getLogger('agentConnection');
var atMostOnce = require('./util/atMostOnce');
var pidStore = require('./pidStore');
var cmdline = require('./cmdline');
var agentOpts = require('./agent/opts');


exports.announceNodeSensor = function announceNodeSensor(cb) {
  cb = atMostOnce('callback for announceNodeSensor', cb);

  var payload = {
    pid: pidStore.pid
  };

  if (cmdline.name && cmdline.args) {
    payload.name = cmdline.name;
    payload.args = cmdline.args;
  }

  payload = JSON.stringify(payload);

  var req = http.request({
    host: agentOpts.host,
    port: agentOpts.port,
    path: '/com.instana.plugin.nodejs.discovery',
    method: 'PUT',
    agent: http.agent,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Content-Length': payload.length
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

  req.write(payload);
  req.end();
};


exports.checkWhetherAgentIsReadyToAcceptData = function checkWhetherAgentIsReadyToAcceptData(cb) {
  checkWhetherResponseForPathIsOkay(
    '/com.instana.plugin.nodejs.' + pidStore.pid,
    function(nodejsSensorLoaded) {
      if (!nodejsSensorLoaded) return cb(false);

      checkWhetherResponseForPathIsOkay(
        '/com.instana.plugin.nodejsapp.' + pidStore.pid,
        cb
      );
    }
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

  var responseCount = 0;
  var responseErrored = false;

  sendAndCheckForCompletion('/com.instana.plugin.nodejs.' + pidStore.pid, data.runtime);
  sendAndCheckForCompletion('/com.instana.plugin.nodejsapp.' + pidStore.pid, data.app);

  function sendAndCheckForCompletion(path, dataToSend) {
    sendData(
      path,
      dataToSend,
      function(error) {
        responseCount++;
        if (error) {
          responseErrored = true;
        }

        if (responseCount === 2) {
          cb(responseErrored);
        }
      }
    );
  }
};


function sendData(path, data, cb) {
  cb = atMostOnce('callback for sendData: ' + path, cb);

  var payload = JSON.stringify(data);
  logger.debug({payload: data}, 'Sending payload to %s', path);

  var req = http.request({
    host: agentOpts.host,
    port: agentOpts.port,
    path: path,
    method: 'POST',
    agent: http.agent,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': payload.length
    }
  }, function(res) {
    res.resume();
    if (res.statusCode < 200 || res.statusCode >= 300) {
      cb(new Error('Failed to send data to agent with status code ' + res.statusCode));
    } else {
      cb(null);
    }
  });

  req.setTimeout(agentOpts.requestTimeout, function onTimeout() {
    cb(new Error('Timeout while trying to send data to agent via path: ' + path));
  });

  req.on('error', function(err) {
    cb(new Error('Send data to agent (path: ' + path + ')request failed: ' + err.message));
  });

  req.write(payload);
  req.end();
}
