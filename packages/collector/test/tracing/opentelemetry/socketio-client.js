/*
 * (c) Copyright IBM Corp. 2023
 */

/* eslint-disable no-console */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('../../..')();

const socketioclient = require('socket.io-client');
require('@instana/core/test/test_util/mockRequireExpress');
const express = require('express');
const port = require('../../test_util/app-port')();
const app = express();
const logPrefix = `SocketIO ClientApp (${process.pid}):\t`;

const ioClient = socketioclient.connect(`http://localhost:${process.env.SOCKETIOSERVER_PORT}`);

ioClient.on('test', () => {
  log('Received msg for "test"');
  ioClient.emit('test_reply', 'welcome');
});

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
