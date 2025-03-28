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

const mock = require('@instana/core/test/test_util/mockRequire');

/**
 * NOTE:
 * Link e.g. @aws-sdk/client-s3-v3 to @aws-sdk/client-s3
 */
if (process.env.AWS_SDK_CLIENT_S3_REQUIRE !== '@aws-sdk/client-s3') {
  mock('@aws-sdk/client-s3', process.env.AWS_SDK_CLIENT_S3_REQUIRE);
}

require('@instana/core/test/test_util/load_express_v4');

require('../../../../../..')();
const express = require('express');
const fetch = require('node-fetch-v2');
const awsSdk3 = require('@aws-sdk/client-s3');
const logPrefix = `AWS SDK v3 S3 (${process.pid}):\t`;
const log = require('@instana/core/test/test_util/log').getLogger(logPrefix);
const port = require('../../../../../test_util/app-port')();
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

function enforceErrors(options, operation) {
  // There is no particular way to break listBuckets as it doesn't have any arguments

  if (operation === 'createBucket') {
    options.GrantFullControl = {};
  }

  if (operation === 'deleteBucket') {
    options.ExpectedBucketOwner = {};
  }

  if (
    operation === 'headObject' ||
    operation === 'getObject' ||
    operation === 'deleteObject' ||
    operation === 'putObject'
  ) {
    options.Key = {};
  }

  if (operation === 'listObjects' || operation === 'listObjectsV2') {
    options.Delimiter = {};
  }
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
          .then(data => fetch(`http://127.0.0.1:${agentPort}`).then(() => data))
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
          .then(data => fetch(`http://127.0.0.1:${agentPort}`).then(() => data))
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
              fetch(`http://127.0.0.1:${agentPort}`).then(() => {
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

app.listen(port, () =>
  log(`AWS SDK v3 S3 app with npm version "${process.env.AWS_SDK_CLIENT_S3_REQUIRE}", listening to port ${port}`)
);
