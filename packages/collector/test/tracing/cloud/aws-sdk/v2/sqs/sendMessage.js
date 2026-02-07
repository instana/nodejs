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

require('../../../../../..')();

const bodyParser = require('body-parser');
const express = require('express');
const { sqs } = require('./sqsUtil');
const queueURL = process.env.AWS_SQS_QUEUE_URL;
const port = require('../../../../../test_util/app-port')();
const logPrefix = `AWS SDK v2 SQS Message Sender (${process.pid}):\t`;
const log = require('@_local/core/test/test_util/log').getLogger(logPrefix);

const app = express();

app.use(bodyParser.json());

app.get('/', (_req, res) => {
  res.send('Ok');
});

function buildMessageParams(withError, isBatch, addHeaders) {
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

  if (addHeaders) {
    sendParams.MessageAttributes = {};
    for (let i = 0; i < addHeaders; i++) {
      sendParams.MessageAttributes[`dummy-attribute-${i}`] = {
        DataType: 'String',
        StringValue: `dummy value ${i}`
      };
    }
  }

  return sendParams;
}

app.post('/send-callback', (req, res) => {
  const withError = req.query.withError !== undefined;
  const isBatch = req.query.isBatch !== undefined;
  const addHeaders = req.query.addHeaders ? parseInt(req.query.addHeaders, 10) : 0;
  const sendParams = buildMessageParams(withError, isBatch, addHeaders);

  const method = isBatch ? 'sendMessageBatch' : 'sendMessage';

  sqs[method](sendParams, (err, data) => {
    if (err) {
      // eslint-disable-next-line
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
  const addHeaders = req.query.addHeaders ? parseInt(req.query.addHeaders, 10) : 0;
  const sendParams = buildMessageParams(withError, isBatch, addHeaders);
  const method = isBatch ? 'sendMessageBatch' : 'sendMessage';

  try {
    const data = await sqs[method](sendParams).promise();
    res.send({
      status: 'OK',
      data
    });
  } catch (err) {
    // eslint-disable-next-line
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
