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

const awsRegion = 'us-east-2';
let dynamoDB;

const awsSdk3 = require('@aws-sdk/client-dynamodb');

if (process.env.USE_LIB_DYNAMODB) {
  const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

  dynamoDB = DynamoDBDocumentClient.from(
    new awsSdk3.DynamoDBClient({
      region: awsRegion
    }),
    {
      marshallOptions: {
        removeUndefinedValues: true
      }
    }
  );
} else {
  dynamoDB = new awsSdk3.DynamoDBClient({ region: awsRegion });
}

const dynamoDBv2 = new awsSdk3.DynamoDB({ region: awsRegion });
const cls = require('@instana/core/src/tracing/cls');

const logPrefix = `AWS SDK v3 DynamoDB (${process.pid}):\t`;
const log = require('@_local/core/test/test_util/log').getLogger(logPrefix);
const port = require('@_local/collector/test/test_util/app-port')();
const agentPort = process.env.INSTANA_AGENT_PORT;
const app = express();
const tableName = process.env.AWS_DYNAMODB_TABLE_NAME || 'nodejs-team';

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
  },
  batchWriteItem: {
    RequestItems: {
      [tableName]: [
        {
          PutRequest: {
            Item: {
              year: {
                N: '2002'
              },
              title: {
                S: 'batch record 1'
              }
            }
          }
        },
        {
          PutRequest: {
            Item: {
              year: {
                N: '2003'
              },
              title: {
                S: 'batch record 2'
              }
            }
          }
        }
      ]
    }
  }
};

const availableOperations = Object.keys(operationParams);
const availableMethods = ['v3', 'v2', 'cb'];

function cap(str) {
  return str[0].toUpperCase() + str.substr(1);
}

function enforceErrors(options, operation) {
  // Inject errors for DynamoDB operations:
  // - Provide an invalid TableName to consistently trigger errors across all operations except list.
  // - For listTables, also provide invalid types for Limit and ExclusiveStartTableName
  options.TableName = 'invalid_table_name!';

  if (operation === 'listTables') {
    options.Limit = 'this should be a number';
    options.ExclusiveStartTableName = {};
  }
}

const checkTableStatus = async (operation, res) => {
  if (operation === 'createTable') {
    if (
      (res && res.TableDescription && res.TableDescription.TableStatus === 'CREATING') ||
      (res && res.Table && res.Table.TableStatus === 'CREATING')
    ) {
      const op = cap('DescribeTableCommand');

      // NOTE: disale http tracing, otherwise we get a lot of http spans because of retries
      cls.isTracing() && cls.setTracingLevel('0');
      const command = new awsSdk3[op]({
        TableName: tableName
      });

      let newRes;

      try {
        newRes = await dynamoDB.send(command);
      } catch (err) {
        // CASE: aws returns 404, but should not return 404
        // ignore
        newRes = res;
      }

      cls.isTracing() && cls.setTracingLevel('1');
      await checkTableStatus(operation, newRes);
    }
  }
};

async function runV3AsPromise(withError, operation) {
  const options = operationParams[operation] || {};
  if (withError) {
    enforceErrors(options, operation);
  }

  const op = cap(`${operation}Command`);
  const command = new awsSdk3[op](options);
  const results = await dynamoDB.send(command);

  if (!withError) {
    await checkTableStatus(operation, results);
  }
  return results;
}

function runV3AsCallback(withError, operation, cb) {
  const options = operationParams[operation] || {};
  if (withError) {
    enforceErrors(options, operation);
  }

  const op = cap(`${operation}Command`);
  const command = new awsSdk3[op](options);
  dynamoDB.send(command, async (err, results) => {
    if (!withError) {
      await checkTableStatus(operation, results);
    }
    cb(err, results);
  });
}

async function runV3AsV2Style(withError, operation) {
  const options = operationParams[operation] || {};
  if (withError) {
    enforceErrors(options, operation);
  }

  const results = await dynamoDBv2[operation](options);
  if (!withError) {
    await checkTableStatus(operation, results);
  }
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
      case 'default-style':
        runV3AsPromise(withError, op)
          .then(data => fetch(`http://127.0.0.1:${agentPort}/ping`).then(() => data))
          .then(data => {
            res.send({
              status: 'ok',
              result: data
            });
          })
          .catch(err => {
            res.status(500).send({ error: String(err) });
          });
        break;
      case 'v2-style':
        runV3AsV2Style(withError, op)
          .then(data => fetch(`http://127.0.0.1:${agentPort}/ping`).then(() => data))
          .then(data => {
            res.send({
              status: 'ok',
              result: data
            });
          })
          .catch(err => {
            res.status(500).send({ error: String(err) });
          });
        break;
      case 'cb-style':
        runV3AsCallback(withError, op, (err, data) => {
          if (err) {
            res.status(500).send({ error: String(err) });
          } else {
            setTimeout(() => {
              fetch(`http://127.0.0.1:${agentPort}/ping`).then(() => {
                res.send({
                  status: 'ok',
                  result: data
                });
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

app.listen(port, () => log(`AWS SDK v3 DynamoDB app, listening to port ${port}`));
