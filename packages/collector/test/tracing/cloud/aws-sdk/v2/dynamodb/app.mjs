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
import getAppPort from '../../../../../test_util/app-port.js';
import logger from '@instana/core/test/test_util/log.js';

const port = getAppPort();

import AWS from 'aws-sdk';
import express from 'express';
const logPrefix = `AWS SDK v2 DynamoDB (${process.pid}):\t`;
AWS.config.update({ region: 'us-east-2' });
const dynamoDB = new AWS.DynamoDB();
const tableName = process.env.AWS_DYNAMODB_TABLE_NAME || 'nodejs-team';
const log = logger.getLogger(logPrefix);

const tableCreationParams = {
  TableName: tableName,
  KeySchema: [
    { AttributeName: 'year', KeyType: 'HASH' },
    { AttributeName: 'title', KeyType: 'RANGE' }
  ],
  AttributeDefinitions: [
    { AttributeName: 'year', AttributeType: 'N' },
    { AttributeName: 'title', AttributeType: 'S' }
  ],
  ProvisionedThroughput: {
    ReadCapacityUnits: 5,
    WriteCapacityUnits: 5
  }
};

const itemKey = {
  year: {
    N: '2001'
  },
  title: {
    S: 'new record'
  }
};

const operationParams = {
  createTable: tableCreationParams,

  /**
   * Deleting table is not part of the instrumentation scope, as seen on Java and Go implementations.
   * However, we need to have this function in place to clean the table before starting tests
   */
  deleteTable: { TableName: tableName },
  listTables: {},
  scan: { TableName: tableName },
  query: {
    TableName: tableName,
    KeyConditionExpression: '#yr = :yyyy',
    ExpressionAttributeNames: {
      '#yr': 'year'
    },
    ExpressionAttributeValues: {
      ':yyyy': {
        N: '2001'
      }
    }
  },
  getItem: {
    TableName: tableName,
    Key: itemKey
  },
  deleteItem: {
    TableName: tableName,
    Key: itemKey
  },
  putItem: {
    TableName: tableName,
    Item: itemKey
  },
  updateItem: {
    TableName: tableName,
    Key: itemKey,
    AttributeUpdates: {
      author: {
        Value: {
          S: 'Neil Gaiman'
        }
      }
    }
  }
};

const availableOperations = Object.keys(operationParams);

const methods = {
  CALLBACK: 'Callback',
  PROMISE: 'Promise',
  ASYNC: 'Async'
};

const availableMethods = Object.values(methods);

const DynamoDBApi = {
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
      options.InvalidDynamoDBKey = '999';
    }

    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve, reject) => {
      let promise;
      let promiseData;

      switch (method) {
        case methods.CALLBACK:
          dynamoDB[operation](options, (err, data) => {
            if (err) {
              return reject(err);
            } else if (data && data.code) {
              return reject(data);
            } else {
              setTimeout(() => {
                fetch(`http://127.0.0.1:${agentPort}/ping`)
                  .then(() => resolve(data))
                  .catch(err2 => reject(err2));
              });
            }
          });
          break;
        case methods.PROMISE:
          promise = dynamoDB[operation](options).promise();

          promise
            .then(data => {
              promiseData = data;
              return delay(200);
            })
            .then(() => fetch(`http://127.0.0.1:${agentPort}/ping`))
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
            const data = await dynamoDB[operation](options).promise();

            if (data && data.code) {
              return reject(data);
            }

            await delay(200);
            await fetch(`http://127.0.0.1:${agentPort}/ping`);

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

app.get('/', (_req, res) => {
  res.send('Ok');
});

/**
 * Expected entries are, eg: /listTables/Callback, /createTable/Async, /putItem/Promise
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
        const data = await DynamoDBApi.runOperation(operation, method, withError);
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

app.listen(port, () => log(`AWS DynamoDB app, listening to port ${port}`));
