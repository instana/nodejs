/*
 * (c) Copyright IBM Corp. 2023
 */

/* eslint-disable no-console */

'use strict';

require('../../..')();

const socketioclient = require('socket.io-client');
const express = require('express');
const port = require('../../test_util/app-port')();
const app = express();
const logPrefix = `SocketIO ClientApp (${process.pid}):\t`;

const ioClient = socketioclient.connect('http://localhost:3000');

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
