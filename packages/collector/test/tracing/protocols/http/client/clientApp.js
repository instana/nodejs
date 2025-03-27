/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('../../../../..')();

const AWS = require('aws-sdk');
const bodyParser = require('body-parser');
const express = require('express-v4');
const fs = require('fs');
const morgan = require('morgan');
const path = require('path');
const fetch = require('node-fetch-v2');
const port = require('../../../../test_util/app-port')();
const httpModule = process.env.USE_HTTPS === 'true' ? require('https') : require('http');
const protocol = process.env.USE_HTTPS === 'true' ? 'https' : 'http';
const baseUrl = `${protocol}://user:password@localhost:${process.env.SERVER_PORT}`;
const sslDir = path.join(__dirname, '..', '..', '..', '..', 'apps', 'ssl');
const key = fs.readFileSync(path.join(sslDir, 'key'));
const cert = fs.readFileSync(path.join(sslDir, 'cert'));

const app = express();

// Use the wrong region (a different region from where the bucket is located) to force an error and a retry in the
// aws-sdk.
const awsRegion = process.env.AWS_REGION || 'eu-central-1';
const s3 = new AWS.S3({ apiVersion: '2006-03-01', region: awsRegion });

const logPrefix = `Express/${protocol} Client (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => res.sendStatus(200));

app.get('/request-url-and-options', (req, res) => {
  httpModule.request(createUrl(req, '/request-url-opts'), { ca: cert }, () => res.sendStatus(200)).end();
});

app.get('/request-url-only', (req, res) => {
  httpModule.request(createUrl(req, '/request-only-url'), () => res.sendStatus(200)).end();
});

app.get('/request-deferred', (req, res) => {
  setTimeout(() => {
    httpModule.get('http://example.com?k=2', () => {}).end();
  }, 500);

  httpModule.get('http://example.com?k=1', () => res.sendStatus(200)).end();
});

app.get('/request-options-only', (req, res) => {
  const downStreamQuery = {};
  if (req.query.withQuery) {
    downStreamQuery.q1 = 'some';
    downStreamQuery.pass = 'verysecret';
    downStreamQuery.q2 = 'value';
  }
  if (req.query.withHeader === 'response') {
    downStreamQuery.withHeader = 'response';
  }
  let downStreamQueryString = Object.keys(downStreamQuery)
    .map(k => `${k}=${downStreamQuery[k]}`)
    .join('&');
  if (downStreamQueryString.length > 0) {
    downStreamQueryString = `?${downStreamQueryString}`;
  }
  const downstreamRequest = {
    hostname: 'localhost',
    port: process.env.SERVER_PORT,
    method: 'GET',
    path: `/request-only-opts${downStreamQueryString}`,
    ca: cert
  };
  if (req.query.withHeader === 'request-via-options') {
    downstreamRequest.headers = {
      'x-my-exit-options-request-header': 'x-my-exit-options-request-header-value',
      'x-my-exit-options-request-multi-header': [
        'x-my-exit-options-request-multi-header-value-1',
        'x-my-exit-options-request-multi-header-value-2'
      ],
      'x-exit-options-not-captured-header': 'whatever'
    };
  }
  const requestObject = httpModule.request(downstreamRequest, () => res.sendStatus(200));
  if (req.query.withHeader === 'set-on-request') {
    requestObject.setHeader('X-MY-EXIT-SET-ON-REQUEST-HEADER', 'x-my-exit-set-on-request-header-value');
    requestObject.setHeader('X-My-Exit-Set-On-Request-Multi-Header', [
      'x-my-exit-set-on-request-multi-header-value-1',
      'x-my-exit-set-on-request-multi-header-value-2'
    ]);
    requestObject.setHeader('x-my-exit-set-on-request-not-captured-jeader', 'whatever');
  }
  requestObject.end();
});

app.get('/request-options-only-null-headers', (req, res) => {
  httpModule
    .request(
      {
        hostname: 'localhost',
        port: process.env.SERVER_PORT,
        method: 'GET',
        path: `/request-only-opts${req.query.withQuery ? '?q1=some&pass=verysecret&q2=value' : ''}`,
        ca: cert,
        headers: null
      },
      () => res.sendStatus(200)
    )
    .end();
});

app.get('/get-url-and-options', (req, res) => {
  httpModule.get(createUrl(req, '/get-url-opts'), { ca: cert }, () => res.sendStatus(200));
});

app.get('/get-url-only', (req, res) => {
  httpModule.get(createUrl(req, '/get-only-url'), () => res.sendStatus(200));
});

app.get('/get-options-only', (req, res) => {
  httpModule.get(
    {
      hostname: 'localhost',
      port: process.env.SERVER_PORT,
      method: 'GET',
      path: `/get-only-opts${req.query.withQuery ? '?q1=some&pass=verysecret&q2=value' : ''}`,
      ca: cert
    },
    () => res.sendStatus(200)
  );
});

app.get('/timeout', (req, res) => {
  fetch(`${baseUrl}/timeout`, {
    method: 'GET',
    timeout: 500,
    ca: cert
  })
    .then(() => {
      res.sendStatus(200);
    })
    .catch(() => {
      res.sendStatus(500);
    });
});

app.get('/deferred-http-exit', (req, res) => {
  // Send the response back first...
  res.sendStatus(200);
  setTimeout(
    () =>
      // ... and make another outgoing HTTP call after that.
      httpModule
        .request({
          hostname: 'localhost',
          port: process.env.SERVER_PORT,
          method: 'GET',
          path: '/request-only-opts',
          ca: cert
        })
        .end(),
    100
  );
});

app.get('/abort', (req, res) => {
  const clientRequest = httpModule.request({
    method: 'GET',
    hostname: 'localhost',
    port: process.env.SERVER_PORT,
    path: '/timeout',
    ca: cert
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
        { ca: cert }, //
        () => {
          // eslint-disable-next-line no-console
          console.log('This should not have happend!');
        }
      )
      .end();
  } catch (e) {
    httpModule
      .request(
        {
          hostname: 'localhost',
          port: process.env.SERVER_PORT,
          method: 'GET',
          path: `/request-only-opts${req.query.withQuery ? '?q1=some&pass=verysecret&q2=value' : ''}`,
          ca: cert
        },
        () => res.sendStatus(200)
      )
      .end();
  }
});

app.put('/expect-continue', (req, res) => {
  const continueRequest = httpModule.request(
    {
      hostname: 'localhost',
      port: process.env.SERVER_PORT,
      method: 'PUT',
      path: '/continue',
      ca: cert,
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
  require('https')
    .createServer({ key, cert }, app)
    .listen(port, () => {
      log(`Listening (HTTPS!) on port: ${port}`);
    });
} else {
  app.listen(port, () => {
    log(`Listening on port: ${port}`);
  });
}

app.post('/upload-s3', (req, res) => {
  if (!process.env.AWS_ACCESS_KEY_ID) {
    // eslint-disable-next-line no-console
    console.error('ERROR: AWS_ACCESS_KEY_ID is not set.');
    return res.sendStatus(500);
  }
  if (!process.env.AWS_SECRET_ACCESS_KEY) {
    // eslint-disable-next-line no-console
    console.error('ERROR: AWS_SECRET_ACCESS_KEY is not set.');
    return res.sendStatus(500);
  }
  if (!process.env.AWS_S3_BUCKET_NAME) {
    // eslint-disable-next-line no-console
    console.error('ERROR: AWS_S3_BUCKET_NAME is not set.');
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
  s3.upload(params, (err, result) => {
    if (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      return res.sendStatus(500);
    } else {
      return res.send(result);
    }
  });
});
app.get('/matrix-params/:params', (req, res) => {
  res.sendStatus(200);
});

function createUrl(req, urlPath) {
  const pathWithQuery = req.query.withQuery ? `${urlPath}?q1=some&pass=verysecret&q2=value` : urlPath;
  return req.query.urlObject ? new URL(pathWithQuery, baseUrl) : baseUrl + pathWithQuery;
}

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
