'use strict';

const agentPort = process.env.INSTANA_AGENT_PORT;

let http;
let httpGet;

if (process.env.REQUIRE_BEFORE_COLLECTOR) {
  // Deliberately initializing @instana/collector too late, that is, after requiring other modules.
  http = require('http');
  httpGet = http.get;
  require(process.env.REQUIRE_BEFORE_COLLECTOR);
  require('../../../../')();
} else {
  // Initializing @instana/collector properly, before other require statements.
  require('../../../../')();
  http = require('http');
  httpGet = http.get;
}

const port = process.env.APP_PORT || 3000;
const app = new http.Server();

const logPrefix = `Partially Uninstrumented (${process.pid}):\t`;

app.on('request', (req, res) => {
  if (process.env.WITH_STDOUT) {
    log(`${req.method} ${req.url}`);
  }
  httpGet(`http://127.0.0.1:${agentPort}`, () => {
    res.end();
  });
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
