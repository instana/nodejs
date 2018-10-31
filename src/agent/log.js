'use strict';

var buffer = require('../util/buffer');
var agentOpts = require('./opts');
var http = require('../http');

module.exports = exports = function log(logLevel, message, stackTrace) {
  var payload = {
    m: message.trim()
  };
  if (stackTrace) {
    payload.st = stackTrace.trim();
  }

  payload = buffer.fromString(JSON.stringify(payload), 'utf8');

  var req = http.request(
    {
      host: agentOpts.host,
      port: agentOpts.port,
      path: '/com.instana.agent.logger',
      method: 'POST',
      agent: http.agent,
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'Content-Length': payload.length,
        'x-log-level': logLevel
      }
    },
    function(res) {
      res.resume();
    }
  );

  req.setTimeout(agentOpts.requestTimeout, swallow);
  req.on('error', swallow);

  req.write(payload);
  req.end();
};

function swallow() {
  // swallow all errors
}
