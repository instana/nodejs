'use strict';

require('../../')();

const logPrefix = `HTTP: Server (${process.pid}):\t`;

const port = process.env.APP_PORT || 3000;

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
