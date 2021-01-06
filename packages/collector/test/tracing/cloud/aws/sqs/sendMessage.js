/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

require('../../../../../')();

const bodyParser = require('body-parser');
const express = require('express');
const { sqs } = require('./sqsUtil');
const queueURL = process.env.AWS_SQS_QUEUE_URL;
const port = process.env.APP_SENDER_PORT || 3215;
const logPrefix = `AWS SQS Message Sender (${process.pid}):\t`;

const app = express();

app.use(bodyParser.json());

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = `${logPrefix}${args[0]}`;
  console.log.apply(console, args);
}

app.get('/', (_req, res) => {
  res.send('Ok');
});

function buildMessageParams(withError, isBatch) {
  const sendParams = {
    QueueUrl: queueURL
  };

  if (!withError && !isBatch) {
    sendParams.MessageBody = 'Hello from Node tracer';
  } else if (!withError && isBatch) {
    sendParams.Entries = [
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
  }

  return sendParams;
}

app.post('/send-callback', (req, res) => {
  const withError = req.query.withError !== undefined;
  const isBatch = req.query.isBatch !== undefined;
  const sendParams = buildMessageParams(withError, isBatch);

  const method = isBatch ? 'sendMessageBatch' : 'sendMessage';

  sqs[method](sendParams, (err, data) => {
    if (err) {
      console.log(err);
      res.status(501).send({
        status: 'ERROR',
        data: String(err)
      });
    } else {
      res.send({
        status: 'OK',
        data
      });
    }
  });
});

app.post('/send-promise', async (req, res) => {
  const withError = req.query.withError !== undefined;
  const isBatch = req.query.isBatch !== undefined;
  const sendParams = buildMessageParams(withError, isBatch);
  const method = isBatch ? 'sendMessageBatch' : 'sendMessage';

  try {
    const data = await sqs[method](sendParams).promise();
    res.send({
      status: 'OK',
      data
    });
  } catch (err) {
    console.log(err);
    res.status(501).send({
      status: 'ERROR',
      data: String(err)
    });
  }
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});
