/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

const mock = require('@_local/core/test/test_util/mockRequire');

if (process.env.AWS_SDK_CLIENT_SQS_REQUIRE !== '@aws-sdk/client-sqs') {
  mock('@aws-sdk/client-sqs', process.env.AWS_SDK_CLIENT_SQS_REQUIRE);
}

const instana = require('../../../../../../src')();
const express = require('express');
const awsSdk3 = require('@aws-sdk/client-sqs');
const { Consumer } = require('sqs-consumer');

const { sendToParent } = require('../../../../../../../core/test/test_util');
const delay = require('../../../../../../../core/test/test_util/delay');

const awsRegion = 'us-east-2';
const port = require('../../../../../test_util/app-port')();
const agentPort = process.env.INSTANA_AGENT_PORT;
const withError = process.env.AWS_SQS_RECEIVER_ERROR === 'true';
const handleMessageBatch = process.env.HANDLE_MESSAGE_BATCH === 'true';
const app = express();

const queueURL = process.env.AWS_SQS_QUEUE_URL;
const logPrefix = `AWS SQS Consumer API (${process.pid}):\t`;
let hasStartedPolling = false;

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = `${logPrefix}${args[0]}`;
  console.log.apply(console, args);
  /* eslint-enable no-console */
}

const sqs = new awsSdk3.SQSClient({ region: awsRegion });

const handleMessageFn = async message => {
  // make sure the span took at least one second to complete
  await delay(1000);
  sendToParent(message);
  await delay(200);

  await fetch(`http://localhost:${agentPort}/ping?msg=${message.Body}`);
  log(`Sent an HTTP request after receiving message of id ${message.MessageId}`);

  if (withError) {
    throw new Error('Forced error');
  }

  // SQS Consumer v14+: must return message(s) to acknowledge; v13 and earlier acknowledged implicitly.
  return message;
};

const handleMessageBatchFn = async messages => {
  // make sure the span took at least one second to complete
  await delay(1000);

  const processed = [];

  messages.forEach(async function (m) {
    sendToParent(m);
    await fetch(`http://localhost:${agentPort}/ping?msg=${m.Body}`);
    log(`Sent an HTTP request after receiving message of id ${m.MessageId}`);
    processed.push(m);
  });

  await delay(200);

  if (withError) {
    throw new Error('Forced error');
  }

  // Explicit acknowledgment for v14+ (must return successfully processed messages)
  return processed;
};

const fn = handleMessageBatch ? { handleMessageBatch: handleMessageBatchFn } : { handleMessage: handleMessageFn };

const consumerApp = Consumer.create(
  Object.assign(
    {
      // MaxNumberOfMessages
      batchSize: 10,
      // waitTimeSeconds: 2,
      // We sometimes receives Messages: undefined, which made the tests flaky
      // https://github.com/aws/aws-sdk-js-v3/issues/1394
      visibilityTimeout: 1,
      queueUrl: queueURL,
      sqs
    },
    fn
  )
);

app.get('/', (_req, res) => {
  if (hasStartedPolling) {
    res.send('OK');
  } else {
    res.status(500).send('Not ready yet.');
  }
});

app.listen(port, () => {
  log(`App started at port ${port}`);
});

async function startPollingWhenReady() {
  // Make sure we are connected to the agent before calling sqs.receiveMessage for the first time.
  if (instana.isConnected()) {
    consumerApp.start();
    hasStartedPolling = true;
  } else {
    await delay(50);
    setImmediate(startPollingWhenReady);
  }
}

startPollingWhenReady();
