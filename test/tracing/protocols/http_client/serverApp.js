/* eslint-disable no-console */

'use strict';

require('../../../../')({
  agentPort: process.env.AGENT_PORT,
  level: 'info',
  tracing: {
    forceTransmissionStartingAt: 1
  }
});

var bodyParser = require('body-parser');
var express = require('express');
var fs = require('fs');
var morgan = require('morgan');
var path = require('path');

var app = express();
var logPrefix = 'Express HTTP client: Server (' + process.pid + '):\t';

if (process.env.WITH_STDOUT) {
  app.use(morgan(logPrefix + ':method :url :status'));
}

app.use(bodyParser.json());

app.get('/', function(req, res) {
  res.set('Foobar', '42');
  res.sendStatus(200);
});

[
  '/request-url-opts',
  '/request-only-url',
  '/request-only-opts',
  '/get-url-opts',
  '/get-only-url',
  '/get-only-opts'
].forEach(function(p) {
  app.get(p, function(req, res) {
    res.sendStatus(200);
  });
});

app.get('/timeout', function(req, res) {
  setTimeout(function() {
    res.sendStatus(200);
  }, 10000);
});

app.put('/continue', function(req, res) {
  // Node http server will automatically send 100 Continue when it receives a request with an "Expect: 100-continue"
  // header present, unless we override the 'checkContinue' listener. For our test case, the default behaviour is just
  // fine.
  res.json({ response: 'yada yada yada' });
});

if (process.env.USE_HTTPS === 'true') {
  var sslDir = path.join(__dirname, '..', '..', '..', 'apps', 'ssl');
  require('https')
    .createServer(
      {
        key: fs.readFileSync(path.join(sslDir, 'key')),
        cert: fs.readFileSync(path.join(sslDir, 'cert'))
      },
      app
    )
    .listen(process.env.APP_PORT, function() {
      log('Listening (HTTPS!) on port: ' + process.env.APP_PORT);
    });
} else {
  app.listen(process.env.APP_PORT, function() {
    log('Listening on port: ' + process.env.APP_PORT);
  });
}

function log() {
  var args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
