/* eslint-disable no-console */

'use strict';

require('../../../../')({
  agentPort: process.env.AGENT_PORT,
  level: 'warn',
  tracing: {
    forceTransmissionStartingAt: 1
  }
});

const bodyParser = require('body-parser');
const rp = require('request-promise');
const express = require('express');
const semver = require('semver');
const morgan = require('morgan');
const AWS = require('aws-sdk');
const path = require('path');
const fs = require('fs');

// WHATWG URL class is globally availabe as of Node.js 10.0.0, needs to be required in older versions.
const URL = semver.lt(process.versions.node, '10.0.0') ? require('url').URL : global.URL;

const httpModule = process.env.USE_HTTPS === 'true' ? require('https') : require('http');
const protocol = process.env.USE_HTTPS === 'true' ? 'https' : 'http';
const baseUrl = `${protocol}://127.0.0.1:${process.env.SERVER_PORT}`;

const app = express();
const awsRegion = process.env.AWS_REGION || 'eu-west-1';
const s3 = new AWS.S3({ apiVersion: '2006-03-01', region: awsRegion });
const logPrefix = `Express HTTP client: Client (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => res.sendStatus(200));

app.get('/request-url-and-options', (req, res) => {
  httpModule
    .request(createUrl(req, '/request-url-opts'), { rejectUnauthorized: false }, () => res.sendStatus(200))
    .end();
});

app.get('/request-url-only', (req, res) => {
  httpModule.request(createUrl(req, '/request-only-url'), () => res.sendStatus(200)).end();
});

app.get('/request-options-only', (req, res) => {
  httpModule
    .request(
      {
        hostname: '127.0.0.1',
        port: process.env.SERVER_PORT,
        method: 'GET',
        path: `/request-only-opts${req.query.withQuery ? '?q1=some&pass=verysecret&q2=value' : ''}`,
        rejectUnauthorized: false
      },
      () => res.sendStatus(200)
    )
    .end();
});

app.get('/request-options-only-null-headers', (req, res) => {
  httpModule
    .request(
      {
        hostname: '127.0.0.1',
        port: process.env.SERVER_PORT,
        method: 'GET',
        path: `/request-only-opts${req.query.withQuery ? '?q1=some&pass=verysecret&q2=value' : ''}`,
        rejectUnauthorized: false,
        headers: null
      },
      () => res.sendStatus(200)
    )
    .end();
});

app.get('/get-url-and-options', (req, res) => {
  httpModule.get(createUrl(req, '/get-url-opts'), { rejectUnauthorized: false }, () => res.sendStatus(200));
});

app.get('/get-url-only', (req, res) => {
  httpModule.get(createUrl(req, '/get-only-url'), () => res.sendStatus(200));
});

app.get('/get-options-only', (req, res) => {
  httpModule.get(
    {
      hostname: '127.0.0.1',
      port: process.env.SERVER_PORT,
      method: 'GET',
      path: `/get-only-opts${req.query.withQuery ? '?q1=some&pass=verysecret&q2=value' : ''}`,
      rejectUnauthorized: false
    },
    () => res.sendStatus(200)
  );
});

app.get('/timeout', (req, res) => {
  rp({
    method: 'GET',
    url: `${baseUrl}/timeout`,
    timeout: 500,
    strictSSL: false
  })
    .then(() => {
      res.sendStatus(200);
    })
    .catch(() => {
      res.sendStatus(500);
    });
});

app.get('/abort', (req, res) => {
  const clientRequest = httpModule.request({
    method: 'GET',
    hostname: '127.0.0.1',
    port: process.env.SERVER_PORT,
    path: '/timeout',
    rejectUnauthorized: false
  });

  clientRequest.end();

  setTimeout(() => {
    clientRequest.abort();
    res.sendStatus(200);
  }, 1500);
});

app.get('/request-malformed-url', (req, res) => {
  try {
    httpModule
      .request(
        //
        'ha-te-te-peh://999.0.0.1:not-a-port/malformed-url', //
        { rejectUnauthorized: false }, //
        () => {
          console.log('This should not have happend!');
        }
      )
      .end();
  } catch (e) {
    httpModule
      .request(
        {
          hostname: '127.0.0.1',
          port: process.env.SERVER_PORT,
          method: 'GET',
          path: `/request-only-opts${req.query.withQuery ? '?q1=some&pass=verysecret&q2=value' : ''}`,
          rejectUnauthorized: false
        },
        () => res.sendStatus(200)
      )
      .end();
  }
});

app.post('/upload-s3', (req, res) => {
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

  const testFilePath = path.join(
    __dirname,
    'upload',
    'Verdi_Messa_da_requiem_Section_7.2_Libera_me_Dies_irae_Markevitch_1959.mp3'
  );
  const readStream = fs.createReadStream(testFilePath);
  const bucketName = process.env.AWS_S3_BUCKET_NAME;
  const params = { Bucket: process.env.AWS_S3_BUCKET_NAME, Key: 'test-file', Body: readStream };
  log(`Uploading to bucket ${bucketName} in region ${awsRegion}`);
  s3.upload(params, () => {
    res.sendStatus(200);
  });
});

app.put('/expect-continue', (req, res) => {
  const continueRequest = httpModule.request(
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
    response => {
      let responseString = '';
      response.on('data', chunk => {
        responseString += chunk;
      });
      response.on('end', () => {
        res.send(responseString);
      });
    }
  );

  continueRequest.on('continue', () => {
    // send body
    continueRequest.end('{"content": "whatever"}');
  });
});

if (process.env.USE_HTTPS === 'true') {
  const sslDir = path.join(__dirname, '..', '..', '..', 'apps', 'ssl');
  require('https')
    .createServer(
      {
        key: fs.readFileSync(path.join(sslDir, 'key')),
        cert: fs.readFileSync(path.join(sslDir, 'cert'))
      },
      app
    )
    .listen(process.env.APP_PORT, () => {
      log(`Listening (HTTPS!) on port: ${process.env.APP_PORT}`);
    });
} else {
  app.listen(process.env.APP_PORT, () => {
    log(`Listening on port: ${process.env.APP_PORT}`);
  });
}

function createUrl(req, urlPath) {
  urlPath = req.query.withQuery ? `${urlPath}?q1=some&pass=verysecret&q2=value` : urlPath;
  return req.query.urlObject ? new URL(urlPath, baseUrl) : baseUrl + urlPath;
}

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
