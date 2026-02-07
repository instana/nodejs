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

const instana = require('../../../../../..')();

const express = require('express');

const { sendToParent } = require('../../../../../../../core/test/test_util');
const delay = require('../../../../../../../core/test/test_util/delay');
const CollectingLogger = require('../../../../../test_util/CollectingLogger');
const TeeLogger = require('../../../../../test_util/TeeLogger');
const { sqs } = require('./sqsUtil');

const instanaLogger = require('../../../../../../src/logger').getLogger();
const collectingLogger = new CollectingLogger();
const teeLogger = new TeeLogger(instanaLogger.logger, collectingLogger);
instana.setLogger(teeLogger);

const port = require('../../../../../test_util/app-port')();
const agentPort = process.env.INSTANA_AGENT_PORT;
const queueURL = process.env.AWS_SQS_QUEUE_URL;

// Keep the default value above 5, as tests can fail if not all messages are fetched.
let sqsPollDelay = 7;
if (process.env.SQS_POLL_DELAY) {
  sqsPollDelay = parseInt(process.env.SQS_POLL_DELAY, 10);
}

const logPrefix = `AWS SDK v2 SQS Message Receiver (${process.pid}):\t`;

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

const log = require('@_local/core/test/test_util/log').getLogger(logPrefix);

const app = express();

app.get('/', (req, res) => {
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

function receivePromise() {
  let span;
  numberOfReceiveMessageAttempts++;
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

      data.Messages.forEach(message => {
        sendToParent(message);
      });

      log(
        'got messages:',
        data.Messages.map(m => m.MessageId)
      );

      span = instana.currentSpan();
      span.disableAutoEnd();

      const messagesForDeletion = data.Messages.map(message => ({
        Id: message.MessageId,
        ReceiptHandle: message.ReceiptHandle
      }));

      return sqs
        .deleteMessageBatch({
          QueueUrl: queueURL,
          Entries: messagesForDeletion
        })
        .promise()
        .then(() => delay(200))
        .then(() => fetch(`http://127.0.0.1:${agentPort}/ping`))
        .then(() => delay(1000))
        .then(() => {
          log('The follow up request after receiving a message has happened.');
          span.end();
        });
    })
    .catch(err => {
      log('message receiving/deleting failed', err);
      span && span.end(1);
    });
}

async function receiveAsync() {
  let span;
  try {
    numberOfReceiveMessageAttempts++;
    const sqsPromise = sqs.receiveMessage(receiveParams).promise();
    const data = await sqsPromise;

    return new Promise(resolve => {
      // TODO: This could be simplified by wrapping the SQS.prototype.receiveMessage method.
      //       See v3/sqs.js
      instana.sdk.runInAsyncContext(sqsPromise.instanaAsyncContext, async () => {
        if (data && data.error) {
          log('receive message data error', data.error);
          return resolve();
        } else if (!data || !data.Messages || data.Messages.length === 0) {
          log('no messages, doing nothing');
          return resolve();
        }

        data.Messages.forEach(message => {
          sendToParent(message);
        });

        log(
          'got messages:',
          data.Messages.map(m => m.MessageId)
        );

        span = instana.currentSpan();
        span.disableAutoEnd();

        const messagesForDeletion = data.Messages.map(message => ({
          Id: message.MessageId,
          ReceiptHandle: message.ReceiptHandle
        }));

        await sqs
          .deleteMessageBatch({
            QueueUrl: queueURL,
            Entries: messagesForDeletion
          })
          .promise();

        await delay(1000);
        await fetch(`http://127.0.0.1:${agentPort}/ping`);
        log('The follow up request after receiving a message has happened.');
        span.end();
        return resolve();
      });
    });
  } catch (err) {
    span && span.end(1);
    log('ERROR receiving/deleting message', err);
    return Promise.reject(err);
  }
}

function receiveCallback(cb) {
  numberOfReceiveMessageAttempts++;
  sqs.receiveMessage(receiveParams, (err, messagesData) => {
    const span = instana.currentSpan();
    span.disableAutoEnd();

    if (err) {
      log(err);
      span.end(1);
      cb();
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

      const messagesForDeletion = messagesData.Messages.map(message => ({
        Id: message.MessageId,
        ReceiptHandle: message.ReceiptHandle
      }));

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
              fetch(`http://127.0.0.1:${agentPort}/ping`)
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
            }, 1000);
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
      // eslint-disable-next-line
      console.error(e);
      process.exit(1);
    }
    pollForMessages();
  } else if (receivedType === 'callback') {
    receiveCallback(() => {
      pollForMessages();
    });
  } else if (receivedType === 'async') {
    try {
      await receiveAsync();
    } catch (e) {
      // eslint-disable-next-line
      console.error(e);
      process.exit(1);
    }
    pollForMessages();
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
