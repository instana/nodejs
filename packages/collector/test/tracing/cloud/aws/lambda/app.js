/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

require('../../../../../src')();

const AWS = require('aws-sdk');
const express = require('express');
const logPrefix = `AWS Lambda (${process.pid}):\t`;
AWS.config.update({ region: 'us-east-2' });
const lambda = new AWS.Lambda();
const functionName = process.env.AWS_LAMBDA_FUNCTION_NAME || 'team-nodejs-invoke-function';
const log = require('@instana/core/test/test_util/log').getLogger(logPrefix);

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

/**
 * @param {'invoke' | 'invokeAsync'} op
 * @param {(err: *, data: *) => void} cb
 * @param {boolean} withError
 * @param {boolean} ctx
 */
function execOperation(op, cb, withError = false, ctx = false) {
  /** @type {import('aws-sdk').Lambda.Types.InvocationRequest | import('aws-sdk').Lambda.Types.InvokeAsyncRequest} */

  const options = { ...operations[op] };
  if (withError) {
    options.InvalidParameter = 1;
  }

  if (ctx && op === 'invoke') {
    options.ClientContext = 'eyJzb21lX2NvbnRlbnQiOiAxfQ==';
  }

  if (typeof cb === 'function') {
    lambda[op](options, cb);
  } else {
    return lambda[op](options).promise();
  }
}

const availableOperations = Object.keys(operations);

const app = express();
const port = process.env.APP_SENDER_PORT || 3215;

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

/**
 * Expected entries are, eg: /invoke/Callback, /invokeAsync/Promise
 */
availableOperations.forEach(operation => {
  app.get(`/${operation}/:method`, async (req, res) => {
    const withError = typeof req.query.withError === 'string' && req.query.withError !== '';
    const ctx = typeof req.query.ctx === 'string' && req.query.ctx !== '';
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
        withError,
        ctx
      );
    } else if (method === 'Promise') {
      execOperation(operation, null, withError, ctx)
        .then(data => {
          httpSuccess(res, data);
        })
        .catch(err => {
          httpError(res, err);
        });
    }
  });
});

app.listen(port, () => log(`AWS Lambda app, listening to port ${port}`));
