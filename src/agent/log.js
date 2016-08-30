'use strict';

var http = require('../http');

var agentOpts = require('./opts');

module.exports = exports = function log(logLevel, message, stackTrace) {
  var payload = {
    m: message.trim()
  };
  if (stackTrace) {
    payload.st = stackTrace.trim();
  }

  payload = JSON.stringify(payload);

  var req = http.request({
    host: agentOpts.host,
    port: agentOpts.port,
    path: '/com.instana.agent.logger',
    method: 'POST',
    agent: http.agent,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': payload.length,
      'x-log-level': logLevel
    }
  }, swallow);

  req.setTimeout(agentOpts.requestTimeout, swallow);
  req.on('error', swallow);

  req.write(payload);
  req.end();
};


function swallow(res) {
  // swallow all errors
  res.resume();
}
