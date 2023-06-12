/*
 * (c) Copyright IBM Corp. 2023
 */

/* eslint-disable no-console */

'use strict';

require('../../../src')();

const express = require('express');
const port = require('../../test_util/app-port')();
const app = express();
const logPrefix = `SocketIO Server App (${process.pid}):\t`;

const ioserver = require('http').createServer();
const io = require('socket.io')(ioserver);
ioserver.listen(3000);

let socket;
io.on('connection', _socket => {
  log('Connected');
  socket = _socket;

  socket.on('test_reply', msg => {
    log('Received msg', msg);
  });
});

app.get('/', (req, res) => {
  if (!socket) return res.sendStatus(500);
  res.sendStatus(200);
});

app.get('/io-emit', (req, res) => {
  log('Received /io-emit request');

  socket.emit('test', 'this is a msg');
  res.send();
});

app.get('/io-send', (req, res) => {
  log('Received /io-send request');

  socket.send('anothertest', 'another msg');
  res.send();
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
