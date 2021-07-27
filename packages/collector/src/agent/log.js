/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const { http } = require('@instana/core').uninstrumentedHttp;
const agentOpts = require('./opts');

/**
 * @param {'debug' | 'info' | 'warning' | 'error'} logLevel
 * @param {string} message
 * @param {*} stackTrace
 */
module.exports = function log(logLevel, message, stackTrace) {
  /** @type {{m: string, st?: string}} */
  const payloadObject = {
    m: message.trim()
  };
  if (stackTrace) {
    payloadObject.st = stackTrace.trim();
  }

  const payload = Buffer.from(JSON.stringify(payloadObject), 'utf8');

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
