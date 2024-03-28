/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

const port = require('../../../test_util/app-port')();

require('../../../..')();

const Mali = require('mali');
const pinoLogger = require('pino')();
const express = require('express');
const morgan = require('morgan');
const path = require('path');

const expressApp = express();

const logPrefix = `GRPC-JS Mali Server (${process.pid}):\t`;
const log = require('@instana/core/test/test_util/log').getLogger(logPrefix);

async function MakeUnaryCall(ctx) {
  pinoLogger.warn('/unary-call');
  ctx.res = { message: 'received: request' };
}

async function StartServerSideStreaming() {
  throw new Error('Not implemented');
}

async function StartClientSideStreaming() {
  throw new Error('Not implemented');
}

async function StartBidiStreaming() {
  throw new Error('Not implemented');
}

const maliApp = new Mali(path.join(__dirname, 'protos', 'test.proto'));

maliApp.use({
  MakeUnaryCall,
  StartServerSideStreaming,
  StartClientSideStreaming,
  StartBidiStreaming
});

maliApp.start('127.0.0.1:50051');

if (process.env.WITH_STDOUT) {
  expressApp.use(morgan(`${logPrefix}:method :url :status`));
}

expressApp.get('/', (req, res) => {
  res.send('OK');
});

expressApp.listen(port, () => {
  log(`Listening on port: ${port}`);
});
