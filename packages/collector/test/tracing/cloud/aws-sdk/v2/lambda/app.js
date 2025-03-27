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

require('../../../../../../src')();

const AWS = require('aws-sdk');
const express = require('express-v4');
const logPrefix = `AWS SDK v2 Lambda (${process.pid}):\t`;
AWS.config.update({ region: 'us-east-2' });
const lambda = new AWS.Lambda();
// We are using a single function, 'nodejs-tracer-lambda', for our Lambda testing since we invoke an existing function.
// Our tests focus on invoking function and retrieving details of the function, rather than creating new ones.
// We originally created this function specifically for testing and are now using it across all test cases.
const functionName = process.env.AWS_LAMBDA_FUNCTION_NAME || 'nodejs-tracer-lambda';
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

  if (ctx && ctx !== 'null' && op === 'invoke') {
    const base64Value = Buffer.from(ctx).toString('base64');
    options.ClientContext = base64Value;
  }

  if (typeof cb === 'function') {
    lambda[op](options, (err, data) => {
      cb(err, {
        data,
        clientContext: options.ClientContext
      });
    });
  } else {
    const p = lambda[op](options).promise();
    p.clientContext = options.ClientContext;
    return p;
  }
}

const availableOperations = Object.keys(operations);

const app = express();
const port = require('../../../../../test_util/app-port')();

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
        withError,
        ctx
      );
    } else if (method === 'Promise') {
      const p = execOperation(operation, null, withError, ctx);

      p.then(data => {
        httpSuccess(res, {
          data,
          clientContext: p.clientContext
        });
      }).catch(err => {
        httpError(res, err);
      });
    }
  });
});

app.listen(port, () => log(`AWS Lambda app, listening to port ${port}`));
