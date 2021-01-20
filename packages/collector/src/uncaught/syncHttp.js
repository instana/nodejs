'use strict';

const net = require('net');

const agentHost = process.env.INSTANA_AGENT_HOST;
const agentPort = process.env.INSTANA_AGENT_PORT;

const path1 = process.env.PATH1;
const payload1 = process.env.PAYLOAD1;
const path2 = process.env.PATH2;
const payload2 = process.env.PAYLOAD2;

let onDataCallback;

if (!agentHost || !agentPort) {
  process.exit(1);
}

const client = net.createConnection(
  {
    host: agentHost,
    port: agentPort
  },
  () => {
    sendRequest(path1, payload1, () => {
      sendRequest(path2, payload2, () => {
        client.end();
      });
    });
  }
);

function sendRequest(endpoint, payload, callback) {
  if (!endpoint || !payload) {
    process.exit(1);
  }
  const payloadLength = Buffer.from(payload, 'utf8').length;
  onDataCallback = callback;
  client.write(
    'POST ' +
    endpoint +
    ' HTTP/1.1\u000d\u000a' +
    'Host: ' +
    agentHost +
    '\u000d\u000a' +
    'Content-Type: application/json; charset=UTF-8\u000d\u000a' +
    'Content-Length: ' +
    payloadLength +
    '\u000d\u000a' +
    '\u000d\u000a' + // extra CRLF before body
      payload
  );
}

client.on('data', () => {
  if (typeof onDataCallback === 'function') {
    onDataCallback();
  }
});

client.on('end', () => {
  process.exit(0);
});
