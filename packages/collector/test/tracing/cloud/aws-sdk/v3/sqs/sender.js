/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const mock = require('mock-require');

/**
 * NOTE:
 * Link e.g. @aws-sdk/client-sqs2 to @aws-sdk/client-sqs
 */
if (process.env.AWS_SDK_CLIENT_SQS_REQUIRE !== '@aws-sdk/client-sqs') {
  mock('@aws-sdk/client-sqs', process.env.AWS_SDK_CLIENT_SQS_REQUIRE);
}

require('../../../../../../')();
const express = require('express');
const delay = require('@instana/core/test/test_util/delay');
const fetch = require('node-fetch');
const awsSdk3 = require('@aws-sdk/client-sqs');
const logPrefix = `AWS SDK v3 SQS Sender (${process.pid}):\t`;
const log = require('@instana/core/test/test_util/log').getLogger(logPrefix);
const port = process.env.APP_PORT || 3215;
const agentPort = process.env.INSTANA_AGENT_PORT || 42699;
const app = express();
const queueURL = process.env.AWS_SQS_QUEUE_URL;
const awsRegion = 'us-east-2';
const sqs = new awsSdk3.SQSClient({ region: awsRegion });
const sqsv2 = new awsSdk3.SQS({ region: awsRegion });

app.get('/', (_req, res) => {
  res.send('Ok');
});

const operationParams = {
  QueueUrl: queueURL
};

const availableMethods = ['v3', 'v2', 'cb'];

function configureOptions(withError, isBatch) {
  const options = Object.assign({}, operationParams);
  if (!withError && !isBatch) {
    options.MessageBody = 'Hello from Node tracer';
  } else if (!withError && isBatch) {
    options.Entries = [
      {
        Id: '1',
        MessageBody: 'Hello from Node tracer'
      },
      {
        Id: '2',
        MessageBody: 'Hello from Node tracer'
      },
      {
        Id: '3',
        MessageBody: 'Hello from Node tracer'
      },
      {
        Id: '4',
        MessageBody: 'Hello from Node tracer'
      }
    ];
  } // else, it's the withError case, which will happen, because MessageBody was not set
  return options;
}

async function runV3AsPromise(withError, isBatch = false) {
  const options = configureOptions(withError, isBatch);
  const sendCommand = isBatch ? 'SendMessageBatchCommand' : 'SendMessageCommand';
  const command = new awsSdk3[sendCommand](options);
  const results = await sqs.send(command);
  return results;
}

function runV3AsCallback(withError, isBatch, cb) {
  const options = configureOptions(withError, isBatch);
  const sendCommand = isBatch ? 'SendMessageBatchCommand' : 'SendMessageCommand';
  const command = new awsSdk3[sendCommand](options);
  sqs.send(command, cb);
}

async function runV3AsV2Style(withError, isBatch = false) {
  const options = configureOptions(withError, isBatch);
  const sendCommand = isBatch ? 'sendMessageBatch' : 'sendMessage';
  const results = await sqsv2[sendCommand](options);
  return results;
}

app.get('/send-message/:method', (req, res) => {
  const withError = req.query.withError === 'true';
  const method = req.params.method;
  const isBatch = req.query.isBatch === 'true';

  switch (method) {
    case 'v3':
      runV3AsPromise(withError, isBatch)
        .then(async data => {
          await delay(200);
          return data;
        })
        .then(data => {
          return fetch(`http://127.0.0.1:${agentPort}`).then(() => data);
        })
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
    case 'v2':
      runV3AsV2Style(withError, isBatch)
        .then(async data => {
          await delay(200);
          return data;
        })
        .then(data => {
          return fetch(`http://127.0.0.1:${agentPort}`).then(() => data);
        })
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
    case 'cb':
      runV3AsCallback(withError, isBatch, (err, data) => {
        if (err) {
          res.status(500).send({ error: String(err) });
        } else {
          setTimeout(() => {
            fetch(`http://127.0.0.1:${agentPort}`)
              .then(() => {
                res.send({
                  status: 'ok',
                  result: data
                });
              })
              .catch(err2 => {
                res.status(500).send({ error: String(err2) });
              });
          });
        }
      });
      break;
    default:
      res.status(500).send({ error: `URL must match one of the methods: ${availableMethods.join(', ')}` });
  }
});

app.listen(port, () => log(`AWS SDK v3 SQS sender, listening to port ${port}`));
