/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const http = require('@instana/core').uninstrumentedHttp.http;

const agentOpts = require('./opts');

module.exports = exports = function log(logLevel, message, stackTrace) {
  let payload = {
    m: message.trim()
  };
  if (stackTrace) {
    payload.st = stackTrace.trim();
  }

  payload = Buffer.from(JSON.stringify(payload), 'utf8');

  const req = http.request(
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
    res => {
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
