'use strict';

const config = {};

if (process.env.SERVICE_CONFIG) {
  config.serviceName = process.env.SERVICE_CONFIG;
}

require('../../../')(config);

const logPrefix = `Server (${process.pid}):\t`;

const http = require('http');
const port = process.env.APP_PORT || 3000;
const app = new http.Server();

app.on('request', (req, res) => {
  if (process.env.WITH_STDOUT) {
    log(`${req.method} ${req.url}`);
  }
  res.end();
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
