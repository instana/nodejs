/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('@instana/collector')();

const logPrefix = `HTTP: Server (${process.pid}):\t`;

const port = process.env.APP_PORT;

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
