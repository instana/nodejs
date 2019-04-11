/* eslint-disable no-console */

'use strict';

require('../../')({
  agentPort: process.env.AGENT_PORT,
  level: 'warn',
  tracing: {
    forceTransmissionStartingAt: 1
  }
});

var bodyParser = require('body-parser');
var rp = require('request-promise');
var express = require('express');
var semver = require('semver');
var morgan = require('morgan');

// WHATWG URL class is globally availabe as of Node.js 10.0.0, needs to be required in older versions.
var URL = semver.lt(process.versions.node, '10.0.0') ? require('url').URL : global.URL;

var http = require('http');
var baseUrl = 'http://127.0.0.1:' + process.env.SERVER_PORT;

var app = express();
var logPrefix = 'Express HTTP client: Client (' + process.pid + '):\t';

if (process.env.WITH_STDOUT) {
  app.use(morgan(logPrefix + ':method :url :status'));
}

app.use(bodyParser.json());

app.get('/', function(req, res) {
  rp({
    method: 'GET',
    url: baseUrl + '/',
    strictSSL: false
  })
    .then(function() {
      res.sendStatus(200);
    })
    .catch(function() {
      res.sendStatus(500);
    });
});

app.get('/request-url-and-options', function(req, res) {
  http
    .request(createUrl(req, '/request-url-opts'), { rejectUnauthorized: false }, function() {
      return res.sendStatus(200);
    })
    .end();
});

app.get('/request-url-only', function(req, res) {
  http
    .request(createUrl(req, '/request-only-url'), function() {
      return res.sendStatus(200);
    })
    .end();
});

app.get('/request-options-only', function(req, res) {
  http
    .request(
      {
        hostname: '127.0.0.1',
        port: process.env.SERVER_PORT,
        method: 'GET',
        path: '/request-only-opts'
      },
      function() {
        return res.sendStatus(200);
      }
    )
    .end();
});

app.get('/request-options-only-null-headers', function(req, res) {
  http
    .request(
      {
        hostname: '127.0.0.1',
        port: process.env.SERVER_PORT,
        method: 'GET',
        path: '/request-only-opts',
        headers: null
      },
      function() {
        return res.sendStatus(200);
      }
    )
    .end();
});

app.get('/get-url-and-options', function(req, res) {
  http.get(createUrl(req, '/get-url-opts'), { rejectUnauthorized: false }, function() {
    return res.sendStatus(200);
  });
});

app.get('/get-url-only', function(req, res) {
  http.get(createUrl(req, '/get-only-url'), function() {
    return res.sendStatus(200);
  });
});

app.get('/get-options-only', function(req, res) {
  http.get(
    {
      hostname: '127.0.0.1',
      port: process.env.SERVER_PORT,
      method: 'GET',
      path: '/get-only-opts'
    },
    function() {
      return res.sendStatus(200);
    }
  );
});

app.get('/timeout', function(req, res) {
  rp({
    method: 'GET',
    url: baseUrl + '/timeout',
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
  var clientRequest = http.request({
    method: 'GET',
    hostname: '127.0.0.1',
    port: process.env.SERVER_PORT,
    path: '/timeout'
  });

  clientRequest.end();

  setTimeout(function() {
    clientRequest.abort();
    res.sendStatus(200);
  }, 1500);
});

app.get('/request-malformed-url', function(req, res) {
  try {
    http
      .request(
        //
        'ha-te-te-peh://999.0.0.1:not-a-port/malformed-url', //
        function() {
          console.log('This should not have happend!');
        }
      )
      .end();
  } catch (e) {
    http
      .request(
        {
          hostname: '127.0.0.1',
          port: process.env.SERVER_PORT,
          method: 'GET',
          path: '/request-only-opts'
        },
        function() {
          return res.sendStatus(200);
        }
      )
      .end();
  }
});

app.listen(process.env.APP_PORT, function() {
  log('Listening on port: ' + process.env.APP_PORT);
});

function createUrl(req, urlPath) {
  return req.query.urlObject ? new URL(urlPath, baseUrl) : baseUrl + urlPath;
}

function log() {
  var args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
