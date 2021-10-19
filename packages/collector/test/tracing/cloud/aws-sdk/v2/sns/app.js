/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

require('../../../../../../')();
const agentPort = process.env.INSTANA_AGENT_PORT || 42699;
const fetch = require('node-fetch');
const delay = require('@instana/core/test/test_util/delay');

const AWS = require('aws-sdk');
const express = require('express');
const logPrefix = `AWS SDK v2 SNS (${process.pid}):\t`;
AWS.config.update({ region: 'us-east-2' });
const sns = new AWS.SNS();

const topicArn = process.env.AWS_SNS_TOPIC_ARN || 'arn:aws:sns:us-east-2:410797082306:team-nodejs';
const log = require('@instana/core/test/test_util/log').getLogger(logPrefix);

const operationParams = {
  publish: {
    TopicArn: topicArn,
    Message: 'Hello from Team Node.js'
  }
};

const availableOperations = Object.keys(operationParams);

const methods = {
  CALLBACK: 'Callback',
  PROMISE: 'Promise',
  ASYNC: 'Async'
};

const availableMethods = Object.values(methods);

const SNSApi = {
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
      options.InvalidSNSKey = '999';
    }

    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve, reject) => {
      let promise;
      let promiseData;

      switch (method) {
        case methods.CALLBACK:
          sns[operation](options, (err, data) => {
            if (err) {
              return reject(err);
            } else if (data && data.code) {
              return reject(data);
            } else {
              setTimeout(() => {
                fetch(`http://127.0.0.1:${agentPort}`)
                  .then(() => resolve(data))
                  .catch(err2 => reject(err2));
              });
            }
          });
          break;
        case methods.PROMISE:
          promise = sns[operation](options).promise();

          promise
            .then(data => {
              promiseData = data;
              return delay(200);
            })
            .then(() => fetch(`http://127.0.0.1:${agentPort}`))
            .then(() => {
              if (promiseData && promiseData.code) {
                reject(promiseData);
              } else {
                resolve(promiseData);
              }
            })
            .catch(err => {
              reject(err);
            });
          break;
        case methods.ASYNC:
          try {
            const data = await sns[operation](options).promise();

            if (data && data.code) {
              return reject(data);
            }

            await delay(200);
            await fetch(`http://127.0.0.1:${agentPort}`);

            return resolve(data);
          } catch (err) {
            return reject(err);
          }
        default:
          reject(new Error(`${method} is not a valid method. Try one of these: ${availableMethods.join(', ')}`));
      }
    });
  }
};

const app = express();
const port = process.env.APP_PORT || 3215;

app.get('/', (_req, res) => {
  res.send('Ok');
});

/**
 * Expected entries are, eg: /publish/Callback, /publish/Async, /publish/Promise
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
        const data = await SNSApi.runOperation(operation, method, withError);
        res.send(data);
      } catch (err) {
        res.send({
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

app.listen(port, () => log(`AWS SDK 2 SNS, listening to port ${port}`));
