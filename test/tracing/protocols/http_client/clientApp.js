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
var rp = require('request-promise');
var express = require('express');
var semver = require('semver');
var morgan = require('morgan');
var AWS = require('aws-sdk');
var path = require('path');
var fs = require('fs');

// WHATWG URL class is globally availabe as of Node.js 10.0.0, needs to be required in older versions.
var URL = semver.lt(process.versions.node, '10.0.0') ? require('url').URL : global.URL;

var httpModule = process.env.USE_HTTPS === 'true' ? require('https') : require('http');
var protocol = process.env.USE_HTTPS === 'true' ? 'https' : 'http';
var baseUrl = protocol + '://127.0.0.1:' + process.env.SERVER_PORT;

var app = express();
var awsRegion = process.env.AWS_REGION || 'eu-west-1';
var s3 = new AWS.S3({ apiVersion: '2006-03-01', region: awsRegion });
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
  httpModule
    .request(createUrl(req, '/request-url-opts'), { rejectUnauthorized: false }, function() {
      return res.sendStatus(200);
    })
    .end();
});

app.get('/request-url-only', function(req, res) {
  httpModule
    .request(createUrl(req, '/request-only-url'), function() {
      return res.sendStatus(200);
    })
    .end();
});

app.get('/request-options-only', function(req, res) {
  httpModule
    .request(
      {
        hostname: '127.0.0.1',
        port: process.env.SERVER_PORT,
        method: 'GET',
        path: '/request-only-opts',
        rejectUnauthorized: false
      },
      function() {
        return res.sendStatus(200);
      }
    )
    .end();
});

app.get('/request-options-only-null-headers', function(req, res) {
  httpModule
    .request(
      {
        hostname: '127.0.0.1',
        port: process.env.SERVER_PORT,
        method: 'GET',
        path: '/request-only-opts',
        rejectUnauthorized: false,
        headers: null
      },
      function() {
        return res.sendStatus(200);
      }
    )
    .end();
});

app.get('/get-url-and-options', function(req, res) {
  httpModule.get(createUrl(req, '/get-url-opts'), { rejectUnauthorized: false }, function() {
    return res.sendStatus(200);
  });
});

app.get('/get-url-only', function(req, res) {
  httpModule.get(createUrl(req, '/get-only-url'), function() {
    return res.sendStatus(200);
  });
});

app.get('/get-options-only', function(req, res) {
  httpModule.get(
    {
      hostname: '127.0.0.1',
      port: process.env.SERVER_PORT,
      method: 'GET',
      path: '/get-only-opts',
      rejectUnauthorized: false
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
  var clientRequest = httpModule.request({
    method: 'GET',
    hostname: '127.0.0.1',
    port: process.env.SERVER_PORT,
    path: '/timeout',
    rejectUnauthorized: false
  });

  clientRequest.end();

  setTimeout(function() {
    clientRequest.abort();
    res.sendStatus(200);
  }, 1500);
});

app.post('/upload-s3', function(req, res) {
  if (!process.env.AWS_ACCESS_KEY_ID) {
    console.error('AWS_ACCESS_KEY_ID is not set.');
    return res.sendStatus(500);
  }
  if (!process.env.AWS_SECRET_ACCESS_KEY) {
    console.error('AWS_SECRET_ACCESS_KEY is not set.');
    return res.sendStatus(500);
  }
  if (!process.env.AWS_S3_BUCKET_NAME) {
    console.error('AWS_S3_BUCKET_NAME is not set.');
    return res.sendStatus(500);
  }

  var testFilePath = path.join(
    __dirname,
    'upload',
    'Verdi_Messa_da_requiem_Section_7.2_Libera_me_Dies_irae_Markevitch_1959.mp3'
  );
  var readStream = fs.createReadStream(testFilePath);
  var bucketName = process.env.AWS_S3_BUCKET_NAME;
  var params = { Bucket: process.env.AWS_S3_BUCKET_NAME, Key: 'test-file', Body: readStream };
  log('Uploading to bucket ' + bucketName + ' in region ' + awsRegion);
  s3.upload(params, function() {
    res.sendStatus(200);
  });
});

app.put('/expect-continue', function(req, res) {
  var continueRequest = httpModule.request(
    {
      hostname: '127.0.0.1',
      port: process.env.SERVER_PORT,
      method: 'PUT',
      path: '/continue',
      rejectUnauthorized: false,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Expect: '100-continue'
      }
    },
    function(response) {
      var responseString = '';
      response.on('data', function(chunk) {
        responseString += chunk;
      });
      response.on('end', function() {
        res.send(responseString);
      });
    }
  );

  continueRequest.on('continue', function() {
    // send body
    continueRequest.end('{"content": "whatever"}');
  });
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

function createUrl(req, urlPath) {
  return req.query.urlObject ? new URL(urlPath, baseUrl) : baseUrl + urlPath;
}

function log() {
  var args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
