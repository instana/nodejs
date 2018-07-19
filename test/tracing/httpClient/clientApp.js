/* eslint-disable no-console */

'use strict';

require('../../../')({
  agentPort: process.env.AGENT_PORT,
  level: 'info',
  tracing: {
    forceTransmissionStartingAt: 1
  }
});

var bodyParser = require('body-parser');
var fs = require('fs');
var path = require('path');
var rp = require('request-promise');
var express = require('express');
var morgan = require('morgan');
var httpModule = process.env.USE_HTTPS === 'true' ? require('https') : require('http');
var protocol = process.env.USE_HTTPS === 'true' ? 'https' : 'http';

var app = express();
var logPrefix = 'Express HTTP client: Client (' + process.pid + '):\t';

if (process.env.WITH_STDOUT) {
  app.use(morgan(logPrefix + ':method :url :status'));
}

app.use(bodyParser.json());

app.get('/', function(req, res) {
  rp({
    method: 'GET',
    url: protocol + '://127.0.0.1:' + process.env.SERVER_PORT + '/',
    strictSSL: false
  })
    .then(function() {
      res.sendStatus(200);
    })
    .catch(function() {
      res.sendStatus(500);
    });
});

app.get('/timeout', function(req, res) {
  rp({
    method: 'GET',
    url: protocol + '://127.0.0.1:' + process.env.SERVER_PORT + '/timeout',
    timeout: 500,
    strictSSL: false
  })
    .then(function() {
      res.sendStatus(200);
    })
    .catch(function() {
      res.sendStatus(500);
    });
});

app.get('/abort', function(req, res) {
  var clientRequest = httpModule.request({
    method: 'GET',
    hostname: '127.0.0.1',
    port: process.env.SERVER_PORT,
    path: '/timeout',
    rejectUnauthorized: false,
  });

  clientRequest.end();

  setTimeout(function() {
    clientRequest.abort();
  }, 300);

  res.sendStatus(200);
});


if (process.env.USE_HTTPS === 'true') {
  var sslDir = path.join(__dirname, '..', '..', 'apps', 'ssl');
  require('https').createServer({
    key: fs.readFileSync(path.join(sslDir, 'key')),
    cert: fs.readFileSync(path.join(sslDir, 'cert'))
  }, app).listen(process.env.APP_PORT, function() {
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
