/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

// Deliberately not calling the initialization function right awy to test the INSTANA_EARLY_INSTRUMENTATION flag.
const instana = require('@instana/collector');

const logPrefix = `PreInit (${process.env.INSTANA_EARLY_INSTRUMENTATION === 'true' ? 'true' : 'false'}) (${
  process.pid
}):\t`;

const http = require('http');

// Deliberately requiring pino _before_ calling @instana/collector#init.
const pino = require('pino')();

const port = require('@_local/collector/test/test_util/app-port')();
const app = new http.Server();

// Only calling @instana/collector#init now, after require statements (and in particular, _after_ requiring pino).
instana();

app.on('request', (req, res) => {
  if (process.env.WITH_STDOUT) {
    log(`${req.method} ${req.url}`);
  }

  if (req.url === '/') {
    if (req.method === 'GET') {
      return res.end();
    } else {
      res.statusCode = 405;
      return res.end();
    }
  } else if (req.url === '/trigger') {
    if (req.method === 'POST') {
      pino.warn('Should be traced if INSTANA_EARLY_INSTRUMENTATION has been set.');
      return res.end();
    } else {
      res.statusCode = 405;
      return res.end();
    }
  } else {
    res.statusCode = 404;
    return res.end();
  }
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
