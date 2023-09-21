/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

require('../../../../../../src')();

const { LambdaClient, InvokeCommand, Lambda, InvokeAsyncCommand } = require('@aws-sdk/client-lambda');
const express = require('express');
const logPrefix = `AWS SDK v3 Lambda (${process.pid}):\t`;
const functionName = process.env.AWS_LAMBDA_FUNCTION_NAME || 'wrapped-async';
const log = require('@instana/core/test/test_util/log').getLogger(logPrefix);
const app = express();
const port = require('../../../../../test_util/app-port')();
const clientOpts = {
  endpoint: process.env.LOCALSTACK_AWS,
  region: 'us-east-2'
};
const lambda = new LambdaClient(clientOpts);
const lambdav2 = new Lambda(clientOpts);
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
  }
};
const commandMapping = {
  invoke: InvokeCommand,
  invokeAsync: InvokeAsyncCommand
};
/**
 * @param {'invoke' | 'invokeAsync'} op
 * @param {boolean} ctx
 */
async function execOperation(op, cb, ctx = null) {
  const options = { ...operations[op] };

  if (ctx && ctx !== 'null' && op === 'invoke') {
    const base64Value = Buffer.from(ctx).toString('base64');
    options.ClientContext = base64Value;
  }
  const command = new commandMapping[op](options);
  if (typeof cb === 'function') {
    lambda.send(command, (err, data) => {
      cb(err, {
        data,
        clientContext: options.ClientContext
      });
    });
  } else {
    const response = await lambda.send(command);
    return {
      data: response,
      clientContext: options.ClientContext || ''
    };
  }
}
async function execOperationV2(op, cb, ctx = null) {
  const options = { ...operations[op] };

  if (ctx && ctx !== 'null' && op === 'invoke') {
    const base64Value = Buffer.from(ctx).toString('base64');
    options.ClientContext = base64Value;
  }

  const command = new InvokeCommand(options);
  if (typeof cb === 'function') {
    lambdav2.send(command, (err, data) => {
      cb(err, {
        data,
        clientContext: options.ClientContext
      });
    });
  } else {
    const response = await lambdav2.send(command);
    return {
      data: response,
      clientContext: options.ClientContext || ''
    };
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

    if (method === 'Callback') {
      execOperation(
        operation,
        (err, data) => {
          if (err) {
            httpError(res, err);
          } else {
            httpSuccess(res, data);
          }
        },
        ctx
      );
    } else if (method === 'Promise') {
      await execOperation(operation, null, ctx)
        .then(result => {
          httpSuccess(res, result);
        })
        .catch(err => {
          httpError(res, err);
        });
    } else if (method === 'PromiseV2') {
      await execOperationV2(operation, null, ctx)
        .then(result => {
          httpSuccess(res, result);
        })
        .catch(err => {
          httpError(res, err);
        });
    } else if (method === 'CallbackV2') {
      await execOperationV2(operation, null, ctx)
        .then(result => {
          httpSuccess(res, result);
        })
        .catch(err => {
          httpError(res, err);
        });
    }
  });
});

app.listen(port, () => log(`AWS Lambda v3 app, listening to port ${port}`));
