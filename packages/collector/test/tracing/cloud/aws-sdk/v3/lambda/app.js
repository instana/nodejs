/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('../../../../../../src')();

const {
  LambdaClient,
  InvokeCommand,
  Lambda,
  InvokeAsyncCommand,
  GetFunctionCommand
} = require('@aws-sdk/client-lambda');
require('@instana/core/test/test_util/mockRequireExpress');
const express = require('express');
const logPrefix = `AWS SDK v3 Lambda (${process.pid}):\t`;
const functionName = process.env.AWS_LAMBDA_FUNCTION_NAME || 'nodejs-tracer-lambda';
const log = require('@instana/core/test/test_util/log').getLogger(logPrefix);
const app = express();
const port = require('../../../../../test_util/app-port')();
const { getClientConfig } = require('./utils');
const clientOpts = getClientConfig();
const lambda = new LambdaClient(clientOpts);
const lambdaV2 = new Lambda(clientOpts);
const operations = {
  invoke: {
    FunctionName: functionName,
    // "Event"|"RequestResponse"|"DryRun"
    InvocationType: 'RequestResponse',
    Payload: '{"ok": true}'
  },
  invokeAsync: {
    FunctionName: functionName,
    InvokeArgs: '{"ok": true}'
  },
  getFunction: {
    FunctionName: functionName
  }
};
const commandMapping = {
  invoke: InvokeCommand,
  invokeAsync: InvokeAsyncCommand,
  getFunction: GetFunctionCommand
};
async function executeOperation(op, ctx = null, method) {
  const options = { ...operations[op] };

  if (ctx && ctx !== 'null' && op === 'invoke') {
    const base64Value = Buffer.from(ctx).toString('base64');
    options.ClientContext = base64Value;
  }
  const command = new commandMapping[op](options);
  return lambdaSend(command, method, options);
}
const defaultStyle = async (client, command, options) => {
  const response = await client.send(command);
  return {
    data: response,
    clientContext: options.ClientContext || ''
  };
};
const callbackStyle = (client, command, options, cb) => {
  lambda.send(command, (err, data) => {
    cb(err, {
      data,
      clientContext: options.ClientContext
    });
  });
};
const promiseStyle = async (client, command, options) => {
  return new Promise((resolve, reject) => {
    client.send(command, (error, result) => {
      if (error) {
        reject(new Error(`Error executing "${command.constructor.name}": ${error.message}`));
      } else {
        const response = {
          data: result,
          clientContext: options.ClientContext || ''
        };
        resolve(response);
      }
    });
  });
};
async function lambdaSend(command, method, options) {
  switch (method) {
    case 'async':
      return defaultStyle(lambda, command, options);
    case 'promise':
      return promiseStyle(lambda, command, options);
    case 'cb':
      return new Promise((resolve, reject) => {
        callbackStyle(lambda, command, options, (err, result) => {
          if (err) {
            reject(err);
          } else {
            resolve(result);
          }
        });
      });
    case 'promise-v2':
      return promiseStyle(lambdaV2, command, options);
    case 'cb-v2':
      return new Promise((resolve, reject) => {
        callbackStyle(lambdaV2, command, options, (err, result) => {
          if (err) {
            reject(err);
          } else {
            resolve(result);
          }
        });
      });
    default:
      return null;
  }
}

const availableOperations = Object.keys(operations);

function httpError(res, err) {
  res.status(500).send({
    status: 'failed',
    error: err
  });
}

function httpSuccess(res, data) {
  res.send({
    status: 'ok',
    data: data
  });
}

app.get('/', (_req, res) => {
  res.send('Ok');
});
availableOperations.forEach(operation => {
  app.get(`/${operation}/:method`, async (req, res) => {
    const ctx = req.query.ctx;
    const method = req.params.method;

    try {
      const data = await executeOperation(operation, ctx, method);
      httpSuccess(res, data);
    } catch (err) {
      httpError(res, err);
    }
  });
});

app.listen(port, () => log(`AWS Lambda v3 app, listening to port ${port}`));
