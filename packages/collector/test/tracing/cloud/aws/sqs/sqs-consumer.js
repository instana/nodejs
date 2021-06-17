/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const instana = require('../../../../../src')();
const express = require('express');
const AWS = require('aws-sdk');
const { Consumer } = require('sqs-consumer');
const request = require('request-promise');
const { sendToParent } = require('../../../../../../core/test/test_util');
const delay = require('../../../../../../core/test/test_util/delay');

AWS.config.update({ region: 'us-east-2' });
const port = process.env.APP_RECEIVER_PORT || 3216;
const agentPort = process.env.INSTANA_AGENT_PORT || 42699;
const withError = process.env.AWS_SQS_RECEIVER_ERROR === 'true';
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

const sqs = new AWS.SQS();

const consumerApp = Consumer.create({
  queueUrl: queueURL,
  sqs,
  handleMessage: async message => {
    // make sure the span took at least one second to complete
    await delay(1000);
    sendToParent(message);
    await delay(200);
    await request(`http://localhost:${agentPort}?msg=${message.Body}`);
    log(`Sent an HTTP request after receiving message of id ${message.MessageId}`);

    if (withError) {
      throw new Error('Forced error');
    }
  }
});

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
