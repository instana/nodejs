/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

require('@instana/core/test/test_util/loadExpress4');

require('../../../../../src')();
const agentPort = process.env.INSTANA_AGENT_PORT;
const fetch = require('node-fetch-v2');
const delay = require('@instana/core/test/test_util/delay');

const AWS = require('aws-sdk');
const express = require('express');
const logPrefix = `Combined AWS SDK v2 products (${process.pid}):\t`;
AWS.config.update({ region: 'us-east-2' });
const s3 = new AWS.S3();
const lambda = new AWS.Lambda();
const dynamoDB = new AWS.DynamoDB();
const kinesis = new AWS.Kinesis();

const app = express();
const port = require('../../../../test_util/app-port')();

const log = require('@instana/core/test/test_util/log').getLogger(logPrefix);

const lambdaFunctionName = process.env.AWS_LAMBDA_FUNCTION_NAME || 'team-nodejs-invoke-function';

const methods = {
  CALLBACK: 'Callback',
  PROMISE: 'Promise',
  ASYNC: 'Async'
};

const availableMethods = Object.values(methods);

const productByOperation = {
  invoke: lambda,
  listBuckets: s3,
  listTables: dynamoDB,
  listStreams: kinesis
};

const operationParams = {
  listBuckets: null,
  invoke: {
    FunctionName: lambdaFunctionName,
    InvocationType: 'RequestResponse',
    Payload: '{"ok": true}'
  },
  listTables: {},
  listStreams: {}
};

const availableOperations = Object.keys(operationParams);

const AWSAPI = {
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
      options.InvalidAWSKey = '999';
    }

    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve, reject) => {
      let promise;
      let promiseData;

      switch (method) {
        case methods.CALLBACK:
          productByOperation[operation][operation](options, (err, data) => {
            if (err) {
              log(
                `${
                  withError ? 'successfully failed' : 'failed'
                } on /${operation}/${method} when receiving response from AWS API`
              );
              return reject(err);
            } else {
              setTimeout(() => {
                fetch(`http://127.0.0.1:${agentPort}`)
                  .then(() => resolve(data))
                  .catch(err2 => {
                    log(
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
          promise = productByOperation[operation][operation](options).promise();

          promise
            .then(data => {
              log(`/${operation}/${method} - received data from AWS SDK`);
              promiseData = data;
              return delay(200);
            })
            .then(() => fetch(`http://127.0.0.1:${agentPort}`))
            .then(() => {
              resolve(promiseData);
            })
            .catch(err => {
              log(
                `${
                  withError ? 'successfully failed' : 'failed'
                } on /${operation}/${method}  from AWS SDK or call to localhost server`
              );

              reject(err);
            });
          break;
        case methods.ASYNC:
          try {
            const data = await productByOperation[operation][operation](options).promise();

            log(`/${operation}/${method} got data from AWS SDK`);

            await delay(200);
            await fetch(`http://127.0.0.1:${agentPort}`);

            return resolve(data);
          } catch (err) {
            log(
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
 * Expected entries are, eg: /listBuckets/:method, /listStreams/:method, /invoke/:method, /listTables/:method
 * Methods: Callback, Async, Promise
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
        const data = await AWSAPI.runOperation(operation, method, withError);
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

app.listen(port, () => log(`AWS combined products server listening to port ${port}`));
