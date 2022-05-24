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

const instana = require('../../../../../..')();

const express = require('express');
const fetch = require('node-fetch');
const awsSdk3 = require('@aws-sdk/client-sqs');
const logPrefix = `AWS SDK v3 SQS Receiver (${process.pid}):\t`;
const log = require('@instana/core/test/test_util/log').getLogger(logPrefix);
const delay = require('@instana/core/test/test_util/delay');
const { sendToParent } = require('@instana/core/test/test_util');
const CollectingLogger = require('../../../../../test_util/CollectingLogger');
const TeeLogger = require('../../../../../test_util/TeeLogger');

const instanaLogger = require('../../../../../../src/logger').getLogger('SQS receiver');
instanaLogger.level('warn');
const collectingLogger = new CollectingLogger();
const teeLogger = new TeeLogger(instanaLogger, collectingLogger);
instana.setLogger(teeLogger);

const port = process.env.APP_PORT || 3216;
const agentPort = process.env.INSTANA_AGENT_PORT || 42699;
const sqsV3ReceiveMethod = process.env.SQSV3_RECEIVE_METHOD || 'v3';
const queueURL = process.env.AWS_SQS_QUEUE_URL;
const awsRegion = 'us-east-2';

const sqs = new awsSdk3.SQSClient({ region: awsRegion });
const sqsv2 = new awsSdk3.SQS({ region: awsRegion });

// Keep the default value above 5, as tests can fail if not all messages are fetched.
let sqsPollDelay = 7;
if (process.env.SQS_POLL_DELAY) {
  sqsPollDelay = parseInt(process.env.SQS_POLL_DELAY, 10);
}

let hasStartedPolling = false;
let numberOfReceiveMessageAttempts = 0;

const receiveParams = {
  AttributeNames: ['SentTimestamp'],
  MaxNumberOfMessages: 10,
  MessageAttributeNames: ['All'],
  QueueUrl: queueURL,
  VisibilityTimeout: 5,
  WaitTimeSeconds: sqsPollDelay
};

const app = express();

app.get('/', (_req, res) => {
  if (hasStartedPolling) {
    res.send('OK');
  } else {
    res.status(500).send('Not ready yet.');
  }
});

/**
 * Responds with the number of times this receiver has _started_ to poll new messages via sqs.receiveMessage.
 */
app.get('/number-of-receive-message-attempts', (req, res) => {
  res.status(200).send(String(numberOfReceiveMessageAttempts));
});

/**
 * Responds with the number of times this receiver has _started_ to poll new messages via sqs.receiveMessage.
 */
app.get('/warn-logs', (req, res) => {
  res.status(200).send(collectingLogger.getWarnLogs());
});

async function runAsPromise(isV2Style = false) {
  const command = new awsSdk3.ReceiveMessageCommand(receiveParams);
  numberOfReceiveMessageAttempts++;
  const promise = isV2Style ? sqsv2.receiveMessage(receiveParams) : sqs.send(command);
  let span;

  return promise
    .then(data => {
      span = instana.currentSpan();
      span.disableAutoEnd();

      if (data && data.error) {
        log('receive message data error', data.error);
        span.end(data.error);
        return;
      } else if (!data || !data.Messages || data.Messages.length === 0) {
        log('No messages, doing nothing');
        return;
      }

      data.Messages.forEach(message => {
        sendToParent(message);
      });

      log(
        'got messages:',
        data.Messages.map(m => m.MessageId)
      );

      const messagesForDeletion = data.Messages.map(message => ({
        Id: message.MessageId,
        ReceiptHandle: message.ReceiptHandle
      }));

      const deletionCommand = new awsSdk3.DeleteMessageBatchCommand({
        QueueUrl: queueURL,
        Entries: messagesForDeletion
      });

      return sqs
        .send(deletionCommand)
        .then(() => delay(200))
        .then(() => fetch(`http://127.0.0.1:${agentPort}`))
        .then(() => delay(1000))
        .then(() => {
          log('The follow up request after receiving a message has happened.');
          span.end();
        });
    })
    .catch(err => {
      log('message receiving/deleting failed', err.message);
      if (!span) {
        span = instana.currentSpan();
      }
      span.end(err);
    });
}

async function runV3AsCallback(cb) {
  const command = new awsSdk3.ReceiveMessageCommand(receiveParams);

  numberOfReceiveMessageAttempts++;
  sqs.send(command, (err, data) => {
    const span = instana.currentSpan();
    span.disableAutoEnd();

    if (err) {
      span.end(err);
      cb(err);
      return;
    }

    if (data && data.error) {
      span.end(data.error);
      cb(data.error);
      return;
    } else if (!data || !data.Messages || data.Messages.length === 0) {
      log('No messages, doing nothing');
      cb();
      return;
    }

    data.Messages.forEach(message => {
      sendToParent(message);
    });

    log(
      'got messages:',
      data.Messages.map(m => m.MessageId)
    );

    const messagesForDeletion = data.Messages.map(message => ({
      Id: message.MessageId,
      ReceiptHandle: message.ReceiptHandle
    }));

    const deletionCommand = new awsSdk3.DeleteMessageBatchCommand({
      QueueUrl: queueURL,
      Entries: messagesForDeletion
    });

    sqs.send(deletionCommand, () => {
      setTimeout(async () => {
        try {
          await fetch(`http://127.0.0.1:${agentPort}`);
          setTimeout(() => {
            log('The follow up request after receiving a message has happened.');
            span.end();
            cb();
          }, 1000);
        } catch (err2) {
          span.end(err2);
          cb(err2);
        }
      }, 200);
    });
  });
}

async function pollForMessages() {
  const method = sqsV3ReceiveMethod;

  log(`Polling SQS (type "${method}")`);

  switch (method) {
    case 'v3':
      try {
        await runAsPromise();
        pollForMessages();
      } catch (err) {
        log('error', err);
        process.exit(1);
      }
      break;
    case 'cb':
      runV3AsCallback(err => {
        if (err) {
          log('error', err);
        }
        pollForMessages();
      });
      break;
    case 'v2':
      try {
        await runAsPromise(true);
        pollForMessages();
      } catch (err) {
        log('error', err);
        process.exit(1);
      }
      break;
    default:
      log(`End with command ${method}`);
  }
}

async function startPollingWhenReady() {
  // Make sure we are connected to the agent before calling "Receive Message Command" for the first time.
  if (instana.isConnected()) {
    pollForMessages();
    hasStartedPolling = true;
  } else {
    await delay(50);
    setImmediate(startPollingWhenReady);
  }
}

startPollingWhenReady();

app.listen(port, () => log(`AWS SDK v3 SQS receiver, listening to port ${port}`));
