'use strict';

// Deliberately not calling the initialization function right awy to test the INSTANA_EARLY_INSTRUMENTATION flag.
const instana = require('../../../');

const logPrefix = `PreInit (${process.env.INSTANA_EARLY_INSTRUMENTATION === 'true' ? 'true' : 'false'}) (${
  process.pid
}):\t`;

const http = require('http');

// Deliberately requiring pino _before_ calling @instana/collector#init.
const pino = require('pino')();

const port = process.env.APP_PORT || 3000;
const app = new http.Server();

// Only calling @instana/collector#init now, after require statements (and in particular, _after_ requiring pino).
instana({
  agentPort: process.env.AGENT_PORT,
  level: 'info',
  tracing: {
    forceTransmissionStartingAt: 1
  }
});

app.on('request', (req, res) => {
  if (process.env.WITH_STDOUT) {
    log(`${req.method} ${req.url}`);
  }
  pino.warn('Should be traced if INSTANA_EARLY_INSTRUMENTATION has been set.');
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
