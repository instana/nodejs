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

const agentPort = process.env.INSTANA_AGENT_PORT;
import fetch from 'node-fetch';
import delay from '../../../../../../../core/test/test_util/delay.js';
import AWS from 'aws-sdk';
import express from 'express';

const logPrefix = `AWS SDK v2 S3 (${process.pid}):\t`;
AWS.config.update({ region: 'us-east-2' });
const s3 = new AWS.S3();

const app = express();
import getAppPort from '../../../../../test_util/app-port.js';
const port = getAppPort();

import log from '@instana/core/test/test_util/log.js';
const logger = log.getLogger(logPrefix);

const bucketName = process.env.AWS_S3_BUCKET_NAME || 'nodejs-team';

const availableOperations = [
  'listBuckets',
  'createBucket',
  'deleteBucket',
  'headObject',
  'putObject',
  'deleteObject',
  'getObject',
  'listObjects',
  'listObjectsV2'
];

const methods = {
  CALLBACK: 'Callback',
  PROMISE: 'Promise',
  ASYNC: 'Async'
};

const availableMethods = Object.values(methods);

const operationParams = {
  putObject: {
    Bucket: bucketName,
    Key: '1'
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

const S3Api = {
  runOperation(operation, method, withError) {
    const originalOptions = operationParams[operation];
    let options;
    if (originalOptions) {
      options = Object.assign({}, originalOptions);
    }

    if (withError) {
      if (!options) {
        options = {};
      }
      options.InvalidS3Key = '999';
    }
    logger(`Bucket name: ${(options && options.Bucket) || 'no bucket name'}`);

    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve, reject) => {
      let promise;
      let promiseData;

      switch (method) {
        case methods.CALLBACK:
          s3[operation](options, (err, data) => {
            if (err) {
              logger(
                `${
                  withError ? 'successfully failed' : 'failed'
                } on /${operation}/${method} when receiving response from AWS API`
              );
              return reject(err);
            } else {
              setTimeout(() => {
                fetch(`http://127.0.0.1:${agentPort}/ping`)
                  .then(() => resolve(data))
                  .catch(err2 => {
                    logger(
                      `${
                        withError ? 'successfully failed' : 'failed'
                      } on /${operation}/${method} when calling localhost server`
                    );
                    return reject(err2);
                  });
              });
            }
          });
          break;
        case methods.PROMISE:
          promise = s3[operation](options).promise();

          promise
            .then(data => {
              logger(`/${operation}/${method} - received data from AWS SDK`);
              promiseData = data;
              return delay(200);
            })
            .then(() => fetch(`http://127.0.0.1:${agentPort}/ping`))
            .then(() => {
              resolve(promiseData);
            })
            .catch(err => {
              logger(
                `${
                  withError ? 'successfully failed' : 'failed'
                } on /${operation}/${method}  from AWS SDK or call to localhost server`
              );

              reject(err);
            });
          break;
        case methods.ASYNC:
          try {
            const data = await s3[operation](options).promise();

            logger(`/${operation}/${method} got data from AWS SDK`);

            await delay(200);
            await fetch(`http://127.0.0.1:${agentPort}/ping`);

            return resolve(data);
          } catch (err) {
            logger(
              `${
                withError ? 'successfully failed' : 'failed'
              } on /${operation}/${method} from AWS SDK or localhost HTTP server`
            );

            return reject(err);
          }
        default:
          reject(new Error(`${method} is not a valid method. Try one of these: ${availableMethods.join(', ')}`));
      }
    });
  }
};

app.get('/', (_req, res) => {
  res.send('Ok');
});

/**
 * Expected entries are, eg: /listBuckets/Callback, /headObject/Async, /deleteBucket/Promise
 */
availableOperations.forEach(operation => {
  app.get(`/${operation}/:method`, async (req, res) => {
    const withError = typeof req.query.withError === 'string' && req.query.withError !== '';
    const method = req.params.method;

    if (!availableMethods.includes(method)) {
      res.status(500).send({
        error: `Valid methods are ${availableMethods.join(', ')}`
      });
    } else {
      try {
        const data = await S3Api.runOperation(operation, method, withError);
        res.send(data);
      } catch (err) {
        res.status(500).send({
          error: err
        });
      }
    }
  });

  app.get(`/${operation}`, (_req, res) => {
    res.status(500).send({
      error: `Use one of the methods. Eg: /${operation}/Callback.\nAvailable methods: ${availableMethods.join(', ')}`
    });
  });
});

app.listen(port, () => logger(`AWS S3 server listening to port ${port}`));
