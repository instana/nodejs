/*
 * (c) Copyright IBM Corp. 2025
 */

/* eslint-disable no-console */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('../../../../..')();

const logPrefix = `HTTP Short Duration: Server (${process.pid}):\t`;
const port = require('../../../../test_util/app-port')();

const server = require('http')
  .createServer()
  .listen(port, () => {
    log(`Listening on port ${port}`);
  });

server.on('request', (req, res) => {
  if (process.env.WITH_STDOUT) {
    log(`${req.method} ${req.url}`);
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  if (path === '/') {
    res.statusCode = 200;
    res.end('OK');
    return;
  }

  if (path === '/duration-micro-sec') {
    const start = process.hrtime.bigint();

    // short delay of 10,000 nanoseconds (≈10 µs)
    const delayInNanoseconds = 10_000n;
    while (process.hrtime.bigint() - start < delayInNanoseconds);

    const end = process.hrtime.bigint();
    const durationMicroseconds = Number(end - start) / 1e3;

    res.statusCode = 200;
    res.end(`OK (≈ ${durationMicroseconds.toFixed(2)} µs)`);
    return;
  }

  if (path === '/normal') {
    setTimeout(() => {
      res.statusCode = 200;
      res.end('Normal response');
    }, 5);
    return;
  }

  res.statusCode = 404;
  res.end('Not found');
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
