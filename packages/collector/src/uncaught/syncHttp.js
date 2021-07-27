/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const http = require('http');

const agentHost = process.env.INSTANA_AGENT_HOST;
const agentPort = process.env.INSTANA_AGENT_PORT;

const path1 = process.env.PATH1;
const payload1 = process.env.PAYLOAD1;
const path2 = process.env.PATH2;
const payload2 = process.env.PAYLOAD2;

if (!agentHost || !agentPort) {
  process.exit(1);
}

sendRequest(path1, payload1, () => {
  sendRequest(path2, payload2, () => {
    process.exit(0);
  });
});

/**
 * @param {string} endpoint
 * @param {string} payload
 * @param {() => void} callback
 */
function sendRequest(endpoint, payload, callback) {
  if (!endpoint || !payload) {
    return callback();
  }

  const payloadBuffer = Buffer.from(payload, 'utf8');
  const contentLength = payloadBuffer.length;
  const req = http.request({
    host: agentHost,
    port: agentPort,
    path: endpoint,
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json; charset=UTF-8',
      'Content-Length': contentLength
    }
  });

  function onRequestTimeout() {
    callback();
  }
  req.setTimeout(150, onRequestTimeout);

  req.write(payloadBuffer, 'utf8');
  req.end(() => {
    req.removeListener('timeout', onRequestTimeout);
    // Fire off next request as soon as the payload has been written to the wire. We deliberately do not wait for the
    // HTTP response from the agent. (We would not try again in case of failure anyway because we need to let the main
    // Node.js process terminate quickly.)
    callback();
  });
}
