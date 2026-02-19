/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('@instana/collector')();
const express = require('express');

const awsSdk3 = require('@aws-sdk/client-s3');
const logPrefix = `AWS SDK v3 S3 (${process.pid}):\t`;
const log = require('@_local/core/test/test_util/log').getLogger(logPrefix);
const port = require('@_local/collector/test/test_util/app-port')();
const agentPort = process.env.INSTANA_AGENT_PORT;
const app = express();
const bucketName = process.env.AWS_S3_BUCKET_NAME || 'nodejs-team';
const awsRegion = 'us-east-2';

const s3 = new awsSdk3.S3Client({ region: awsRegion });
const s3v2 = new awsSdk3.S3({ region: awsRegion });

const availableOperations = [
  'createBucket',
  'listBuckets',
  'putObject',
  'headObject',
  'getObject',
  'listObjects',
  'listObjectsV2',
  'deleteObject',
  'deleteBucket'
];

const operationParams = {
  putObject: {
    Bucket: bucketName,
    Key: '1',
    Body: 'some body'
  },
  headObject: {
    Bucket: bucketName,
    Key: '1'
  },
  deleteObject: {
    Bucket: bucketName,
    Key: '1'
  },
  getObject: {
    Bucket: bucketName,
    Key: '1'
  },
  createBucket: {
    Bucket: bucketName
  },
  deleteBucket: {
    Bucket: bucketName
  },
  listObjectsV2: {
    Bucket: bucketName
  },
  listObjects: {
    Bucket: bucketName
  },
  listBuckets: null
};

const availableMethods = ['v3', 'v2', 'cb'];

function cap(str) {
  return str[0].toUpperCase() + str.substr(1);
}

function enforceErrors(options) {
  // Use an invalid bucket name to trigger a server-side AWS error.
  // Newer SDK versions validate inputs strictly, so previous error injections
  // (like invalid types) fail client-side. This approach
  // stays schema-safe and guarantees a real failing S3 request for every operation.
  //
  // Deliberately invalid bucket name (underscores + punctuation) to trigger AWS-side errors
  options.Bucket = 'invalid_bucket_name!';
}

// When the operation is getObject, the data comes in a StreamReader
function handleGetObject(httpResponse, s3ResultData) {
  let buffer;
  s3ResultData.Body.on('data', chunk => {
    buffer = Buffer.concat([chunk]);
  });

  s3ResultData.Body.on('end', () => {
    httpResponse.send({
      status: 'ok',
      result: Buffer.from(buffer).toString()
    });
  });
}

async function runV3AsPromise(withError, operation) {
  const options = Object.assign({}, operationParams[operation] || {});
  if (withError) {
    enforceErrors(options, operation);
  }

  const op = cap(`${operation}Command`);
  const command = new awsSdk3[op](options);
  const results = await s3.send(command);
  return results;
}

function runV3AsCallback(withError, operation, cb) {
  const options = Object.assign({}, operationParams[operation] || {});
  if (withError) {
    enforceErrors(options, operation);
  }

  const op = cap(`${operation}Command`);
  const command = new awsSdk3[op](options);
  s3.send(command, cb);
}

async function runV3AsV2Style(withError, operation) {
  const options = Object.assign({}, operationParams[operation] || {});
  if (withError) {
    enforceErrors(options, operation);
  }

  const results = await s3v2[operation](options);
  return results;
}

app.get('/', (_req, res) => {
  res.send('Ok');
});

availableOperations.forEach(op => {
  app.get(`/${op}/:method`, (req, res) => {
    const withError = typeof req.query.withError === 'string' && req.query.withError !== '';
    const method = req.params.method;

    switch (method) {
      case 'v3':
        runV3AsPromise(withError, op)
          .then(data => fetch(`http://127.0.0.1:${agentPort}/ping`).then(() => data))
          .then(data => {
            if (op === 'getObject') {
              handleGetObject(res, data);
            } else {
              res.send({
                status: 'ok',
                result: data
              });
            }
          })
          .catch(err => {
            res.status(500).send({ error: String(err) });
          });
        break;
      case 'v2':
        runV3AsV2Style(withError, op)
          .then(data => fetch(`http://127.0.0.1:${agentPort}/ping`).then(() => data))
          .then(data => {
            if (op === 'getObject') {
              handleGetObject(res, data);
            } else {
              res.send({
                status: 'ok',
                result: data
              });
            }
          })
          .catch(err => {
            res.status(500).send({ error: String(err) });
          });
        break;
      case 'cb':
        runV3AsCallback(withError, op, (err, data) => {
          if (err) {
            res.status(500).send({ error: String(err) });
          } else {
            setTimeout(() => {
              fetch(`http://127.0.0.1:${agentPort}/ping`).then(() => {
                if (op === 'getObject') {
                  handleGetObject(res, data);
                } else {
                  res.send({
                    status: 'ok',
                    result: data
                  });
                }
              });
            });
          }
        });
        break;
      default:
        res.status(500).send({ error: `URL must match one of the methods: ${availableMethods.join(', ')}` });
    }
  });
});

app.listen(port, () => log(`AWS SDK v3 S3 app listening to port ${port}`));
