/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const instana = require('../../../../../')();
const express = require('express');
const port = process.env.APP_RECEIVER_PORT || 3216;
const agentPort = process.env.INSTANA_AGENT_PORT || 80;
const request = require('request-promise');
const { sendToParent } = require('../../../../../../core/test/test_util');

const app = express();

const delay = require('../../../../../../core/test/test_util/delay');
const { sqs } = require('./sqsUtil');
const queueURL = process.env.AWS_SQS_QUEUE_URL;
const logPrefix = `AWS SQS Message Receiver (${process.pid}):\t`;

let hasStartedPolling = false;

const receiveParams = {
  AttributeNames: ['SentTimestamp'],
  MaxNumberOfMessages: 10,
  MessageAttributeNames: ['All'],
  QueueUrl: queueURL,
  VisibilityTimeout: 5,
  // Please keep this value above 5, as tests can fail if not all messages are received
  WaitTimeSeconds: 7
};

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = `${logPrefix}${args[0]}`;
  console.log.apply(console, args);
}

app.get('/', (_req, res) => {
  if (hasStartedPolling) {
    res.send('OK');
  } else {
    res.status(500).send('Not ready yet.');
  }
});

function receivePromise() {
  let span;
  return sqs
    .receiveMessage(receiveParams)
    .promise()
    .then(data => {
      if (data && data.error) {
        log('receive message data error', data.error);
        return;
      } else if (!data || !data.Messages || data.Messages.length === 0) {
        log('no messages, doing nothing');
        return;
      }

      span = instana.currentSpan();
      span.disableAutoEnd();

      data.Messages.forEach(message => {
        sendToParent(message);
      });

      log(
        'got messages:',
        data.Messages.map(m => m.MessageId)
      );

      const messagesForDeletion = data.Messages.map(message => {
        return {
          Id: message.MessageId,
          ReceiptHandle: message.ReceiptHandle
        };
      });

      return sqs
        .deleteMessageBatch({
          QueueUrl: queueURL,
          Entries: messagesForDeletion
        })
        .promise()
        .then(() => delay(200))
        .then(() => request(`http://127.0.0.1:${agentPort}`))
        .then(() => {
          log('The follow up request after receiving a message has happened.');
          span.end();
        });
    })
    .catch(err => {
      log('message receiving failed', err);
      span && span.end(1);
    });
}

async function receiveAsync() {
  let span;
  try {
    const sqsPromise = sqs.receiveMessage(receiveParams).promise();
    const data = await sqsPromise;
    instana.sdk.runInAsyncContext(sqsPromise.instanaAsyncContext, async () => {
      if (data && data.error) {
        log('receive message data error', data.error);
        return;
      } else if (!data || !data.Messages || data.Messages.length === 0) {
        log('no messages, doing nothing');
        return;
      }

      span = instana.currentSpan();
      span.disableAutoEnd();

      data.Messages.forEach(message => {
        sendToParent(message);
      });

      log(
        'got messages:',
        data.Messages.map(m => m.MessageId)
      );

      const messagesForDeletion = data.Messages.map(message => {
        return {
          Id: message.MessageId,
          ReceiptHandle: message.ReceiptHandle
        };
      });

      await sqs
        .deleteMessageBatch({
          QueueUrl: queueURL,
          Entries: messagesForDeletion
        })
        .promise();

      await delay(200);
      await request(`http://127.0.0.1:${agentPort}`);
      log('The follow up request after receiving a message has happened.');
      span.end();
    });
  } catch (err) {
    span && span.end(1);
    log('error receiving message', err);
  }
}

function receiveCallback(cb) {
  sqs.receiveMessage(receiveParams, (err, messagesData) => {
    const span = instana.currentSpan();
    span.disableAutoEnd();

    if (err) {
      log(err);
      cb();
      span.end(1);
    } else if (messagesData.error) {
      log('receive message data error', messagesData.error);
    } else if (messagesData.Messages) {
      messagesData.Messages.forEach(message => {
        sendToParent(message);
      });

      log(
        'got messages:',
        messagesData.Messages.map(m => m.MessageId)
      );

      const messagesForDeletion = messagesData.Messages.map(message => {
        return {
          Id: message.MessageId,
          ReceiptHandle: message.ReceiptHandle
        };
      });

      sqs.deleteMessageBatch(
        {
          QueueUrl: queueURL,
          Entries: messagesForDeletion
        },
        deleteErr => {
          if (deleteErr) {
            log(deleteErr);
            cb();
          } else {
            log('Messages deleted');
            setTimeout(() => {
              request(`http://127.0.0.1:${agentPort}`)
                .then(() => {
                  log('The follow up request after receiving a message has happened.');
                  span.end();
                  cb();
                })
                .catch(catchErr => {
                  log('The follow up request after receiving a message has failed.', catchErr);
                  span.end(1);
                  cb();
                });
            }, 200);
          }
        }
      );
    } else {
      cb();
    }
  });
}

async function pollForMessages() {
  const receivedType = process.env.SQS_RECEIVE_METHOD || 'callback';

  log(`Polling SQS (type "${receivedType}")`);

  if (receivedType === 'promise') {
    try {
      await receivePromise();
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
    setImmediate(pollForMessages);
  } else if (receivedType === 'callback') {
    receiveCallback(() => {
      setImmediate(pollForMessages);
    });
  } else if (receivedType === 'async') {
    try {
      await receiveAsync();
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
    setImmediate(pollForMessages);
  } else {
    log(`End with command ${receivedType}`);
  }
}

async function startPollingWhenReady() {
  // Make sure we are connected to the agent before calling sqs.receiveMessage for the first time.
  if (instana.isConnected()) {
    pollForMessages();
    hasStartedPolling = true;
  } else {
    await delay(50);
    setImmediate(startPollingWhenReady);
  }
}

startPollingWhenReady();

app.listen(port, () => {
  log(`Receiver server started at port ${port}`);
});
