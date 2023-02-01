/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

require('../..')();

const logPrefix = `HTTP: Server (${process.pid}):\t`;

const port = require('../test_util/app-port')();

const server = require('http')
  .createServer()
  .listen(port, () => {
    log(`Listening (HTTP) on port: ${port}`);
  });

server.on('request', (req, res) => {
  res.end();
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  // eslint-disable-next-line no-console
  console.log.apply(console, args);
}
