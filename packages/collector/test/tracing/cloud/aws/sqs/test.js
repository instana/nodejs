/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const semver = require('semver');
const path = require('path');
const { expect } = require('chai');
const { fail } = expect;
const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../../core/test/config');
const {
  expectExactlyOneMatching,
  expectAtLeastOneMatching,
  retry,
  delay,
  stringifyItems
} = require('../../../../../../core/test/test_util');
const ProcessControls = require('../../../../test_util/ProcessControls');
const globalAgent = require('../../../../globalAgent');
const { sendMessageWithLegacyHeaders } = require('./sendNonInstrumented');
const {
  verifyHttpRootEntry,
  verifyHttpExit,
  verifyExitSpan
} = require('@instana/core/test/test_util/common_verifications');

const queueUrlPrefix = process.env.SQS_QUEUE_URL_PREFIX || 'https://sqs.us-east-2.amazonaws.com/410797082306/';

let queueName = 'node_sensor';

if (process.env.SQS_QUEUE_NAME) {
  queueName = `${process.env.SQS_QUEUE_NAME}${semver.major(process.versions.node)}`;
}

const queueURL = `${queueUrlPrefix}${queueName}`;

let mochaSuiteFn;

const sendingMethods = ['callback', 'promise'];
const receivingMethods = ['callback', 'promise', 'async'];

const getNextSendMethod = require('@instana/core/test/test_util/circular_list').getCircularList(sendingMethods);
const getNextReceiveMethod = require('@instana/core/test/test_util/circular_list').getCircularList(receivingMethods);

if (!supportedVersion(process.versions.node)) {
  mochaSuiteFn = describe.skip;
} else {
  mochaSuiteFn = describe;
}

const retryTime = config.getTestTimeout() * 2;

mochaSuiteFn('tracing/cloud/aws/sqs', function () {
  this.timeout(config.getTestTimeout() * 3);

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  describe('tracing enabled, no suppression', function () {
    const senderControls = new ProcessControls({
      appPath: path.join(__dirname, 'sendMessage'),
      port: 3215,
      useGlobalAgent: true,
      env: {
        AWS_SQS_QUEUE_URL: queueURL
      }
    });

    ProcessControls.setUpHooksWithRetryTime(retryTime, senderControls);

    receivingMethods.forEach(sqsReceiveMethod => {
      describe(`receiving via ${sqsReceiveMethod} API`, () => {
        const receiverControls = new ProcessControls({
          appPath: path.join(__dirname, 'receiveMessage'),
          port: 3216,
          useGlobalAgent: true,
          env: {
            SQS_RECEIVE_METHOD: sqsReceiveMethod,
            AWS_SQS_QUEUE_URL: queueURL
          }
        });

        ProcessControls.setUpHooksWithRetryTime(retryTime, receiverControls);

        [false, 'sender'].forEach(withError => {
          const sqsSendMethod = getNextSendMethod();
          const apiPath = `/send-${sqsSendMethod}`;
          const urlWithParams = withError ? apiPath + '?withError=true' : apiPath;

          it(`send(${sqsSendMethod}); receive(${sqsReceiveMethod}); error: ${!!withError}`, async () => {
            const response = await senderControls.sendRequest({
              method: 'POST',
              path: urlWithParams,
              simple: withError !== 'sender'
            });

            return verify(receiverControls, response, apiPath, withError);
          });
        });

        it('falls back to legacy "S" headers if needed. eg: X_INSTANA_ST instead of X_INSTANA_T', async () => {
          await sendMessageWithLegacyHeaders(queueURL, '1234', '5678');
          return verifyLegacy();
        });

        function verifyLegacy() {
          return retry(async () => {
            const spans = await agentControls.getSpans();
            return expectExactlyOneMatching(spans, [
              span => expect(span.t).to.equal('1234'),
              span => expect(span.p).to.equal('5678'),
              span => expect(span.k).to.equal(constants.ENTRY)
            ]);
          }, retryTime);
        }
      });
    });

    describe('sqs-consumer API', () => {
      const sqsConsumerControls = new ProcessControls({
        appPath: path.join(__dirname, 'sqs-consumer'),
        port: 3216,
        useGlobalAgent: true,
        env: {
          AWS_SQS_QUEUE_URL: queueURL
        }
      });

      ProcessControls.setUpHooksWithRetryTime(retryTime, sqsConsumerControls);

      const apiPath = '/send-callback';

      it('receives message', async () => {
        const response = await senderControls.sendRequest({
          method: 'POST',
          path: apiPath
        });

        return verify(sqsConsumerControls, response, apiPath, false);
      });
    });

    receivingMethods.forEach(sqsReceiveMethod => {
      describe('batched messages', () => {
        const receiverControls = new ProcessControls({
          appPath: path.join(__dirname, 'receiveMessage'),
          port: 3216,
          useGlobalAgent: true,
          env: {
            SQS_RECEIVE_METHOD: sqsReceiveMethod,
            AWS_SQS_QUEUE_URL: queueURL
          }
        });

        ProcessControls.setUpHooksWithRetryTime(retryTime, receiverControls);

        const sqsSendMethod = getNextSendMethod();
        const apiPath = `/send-${sqsSendMethod}`;

        it(`sending(${sqsSendMethod}); receiving(${sqsReceiveMethod})`, async () => {
          const response = await senderControls.sendRequest({
            method: 'POST',
            path: `${apiPath}?isBatch=1`
          });

          return verify(receiverControls, response, apiPath, false, true);
        });
      });
    });

    function verify(receiverControls, response, apiPath, withError, isBatch) {
      if (withError === 'sender') {
        expect(response.data).to.equal("MissingRequiredParameter: Missing required key 'MessageBody' in params");
      } else {
        return retry(() => {
          if (isBatch) {
            verifyResponseAndBatchMessage(response, receiverControls);
          } else {
            verifyResponseAndMessage(response, receiverControls);
          }
          return agentControls
            .getSpans()
            .then(spans => verifySpans(receiverControls, spans, apiPath, null, withError, isBatch));
        }, retryTime);
      }
    }

    function verifySpans(receiverControls, spans, apiPath, messageId, withError, isBatch) {
      const httpEntry = verifyHttpRootEntry({ spans, apiPath, pid: String(senderControls.getPid()) });
      const sqsExit = verifyExitSpan({
        spanName: 'sqs',
        spans,
        parent: httpEntry,
        withError,
        pid: String(senderControls.getPid()),
        extraTests: [
          span => expect(span.data.sqs.sort).to.equal('exit'),
          span => expect(span.data.sqs.queue).to.equal(queueURL)
        ]
      });
      if (withError !== 'publisher') {
        const sqsEntry = verifySQSEntry(receiverControls, spans, sqsExit, messageId, withError, isBatch);
        verifyHttpExit({ spans, parent: sqsEntry, pid: String(receiverControls.getPid()) });
      }
    }

    function verifySQSEntry(receiverControls, spans, parent, messageId, withError, isBatch) {
      let operation = expectExactlyOneMatching;

      /**
       * When receiving messages in batch, we can have more than one span that matches the criteria because
       * SQS may not send all messages in one batch, thus we cannot guarantee that all messages will be in the batch.
       * More info: https://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_ReceiveMessage.html
       */
      if (isBatch) {
        operation = expectAtLeastOneMatching;
      }

      return operation(spans, [
        span => expect(span.n).to.equal('sqs'),
        span => expect(span.k).to.equal(constants.ENTRY),
        span => expect(span.t).to.equal(parent.t),
        span => expect(span.p).to.equal(parent.s),
        span => expect(span.f.e).to.equal(String(receiverControls.getPid())),
        span => expect(span.f.h).to.equal('agent-stub-uuid'),
        span => expect(span.error).to.not.exist,
        span => expect(span.ec).to.equal(withError ? 1 : 0),
        span => expect(span.async).to.not.exist,
        span => expect(span.data).to.exist,
        span => expect(span.data.sqs).to.be.an('object'),
        span => expect(span.data.sqs.sort).to.equal('entry'),
        span => expect(span.data.sqs.queue).to.equal(queueURL),
        span => expect(span.data.sqs.size).to.be.an('number')
      ]);
    }
  });

  describe('tracing disabled', () => {
    this.timeout(config.getTestTimeout() * 2);

    const senderControls = new ProcessControls({
      appPath: path.join(__dirname, 'sendMessage'),
      port: 3215,
      useGlobalAgent: true,
      tracingEnabled: false,
      env: {
        AWS_SQS_QUEUE_URL: queueURL
      }
    });

    ProcessControls.setUpHooksWithRetryTime(retryTime, senderControls);

    const receivingMethod = getNextReceiveMethod();
    describe('sending and receiving', () => {
      const receiverControls = new ProcessControls({
        appPath: path.join(__dirname, 'receiveMessage'),
        port: 3216,
        useGlobalAgent: true,
        tracingEnabled: false,
        env: {
          SQS_RECEIVE_METHOD: receivingMethod,
          AWS_SQS_QUEUE_URL: queueURL
        }
      });

      ProcessControls.setUpHooksWithRetryTime(retryTime, receiverControls);

      const sendingMethod = getNextSendMethod();
      it(`should not trace for sending(${sendingMethod}) / receiving(${receivingMethod})`, async () => {
        const response = await senderControls.sendRequest({
          method: 'POST',
          path: `/send-${sendingMethod}`
        });

        return retry(() => verifyResponseAndMessage(response, receiverControls), retryTime)
          .then(() => delay(config.getTestTimeout() / 4))
          .then(() => agentControls.getSpans())
          .then(spans => {
            if (spans.length > 0) {
              fail(`Unexpected spans (AWS SQS suppressed: ${stringifyItems(spans)}`);
            }
          });
      });
    });
  });

  describe('tracing enabled but suppressed', () => {
    const senderControls = new ProcessControls({
      appPath: path.join(__dirname, 'sendMessage'),
      port: 3215,
      useGlobalAgent: true,
      env: {
        AWS_SQS_QUEUE_URL: queueURL
      }
    });

    ProcessControls.setUpHooksWithRetryTime(retryTime, senderControls);

    const receivingMethod = getNextReceiveMethod();
    describe('tracing suppressed', () => {
      const receiverControls = new ProcessControls({
        appPath: path.join(__dirname, 'receiveMessage'),
        port: 3216,
        useGlobalAgent: true,
        env: {
          SQS_RECEIVE_METHOD: receivingMethod,
          AWS_SQS_QUEUE_URL: queueURL
        }
      });

      ProcessControls.setUpHooksWithRetryTime(retryTime, receiverControls);

      const sendingMethod = getNextSendMethod();
      it(`doesn't trace when sending(${sendingMethod}) and receiving(${receivingMethod})`, async () => {
        const response = await senderControls.sendRequest({
          method: 'POST',
          path: `/send-${sendingMethod}`,
          headers: {
            'X-INSTANA-L': '0'
          }
        });

        return retry(() => {
          verifyResponseAndMessage(response, receiverControls);
        }, retryTime)
          .then(() => delay(config.getTestTimeout() / 4))
          .then(() => agentControls.getSpans())
          .then(spans => {
            if (spans.length > 0) {
              fail(`Unexpected spans (AWS SQS suppressed: ${stringifyItems(spans)}`);
            }
          });
      });
    });
  });

  describe('tracing enabled with wrong queue name', () => {
    const receiverControls = new ProcessControls({
      appPath: path.join(__dirname, 'receiveMessage'),
      port: 3216,
      useGlobalAgent: true,
      env: {
        SQS_RECEIVE_METHOD: 'callback',
        AWS_SQS_QUEUE_URL: queueURL + '-non-existent'
      }
    });

    ProcessControls.setUpHooksWithRetryTime(retryTime, receiverControls);

    it('reports an error span', async () => {
      await retry(() => delay(config.getTestTimeout() / 4), retryTime);
      const spans = await agentControls.getSpans();

      return expectAtLeastOneMatching(spans, [
        span => expect(span.ec).equal(1),
        span => expect(span.data.sqs.error).to.equal('AWS.SimpleQueueService.NonExistentQueue')
      ]);
    });
  });
});

function verifyResponseAndMessage(response, receiverControls) {
  expect(response).to.be.an('object');
  const messageId = response.data.MessageId;
  expect(messageId).to.be.a('string');
  const receivedMessages = receiverControls.getIpcMessages();
  expect(receivedMessages).to.be.an('array');
  expect(receivedMessages).to.have.lengthOf.at.least(1);
  const message = receivedMessages.filter(({ MessageId }) => MessageId === messageId)[0];
  expect(message).to.exist;
  expect(message.Body).to.equal('Hello from Node tracer');
  return messageId;
}

function verifyResponseAndBatchMessage(response, receiverControls) {
  expect(response.data).to.be.an('object');
  expect(response.data.Successful.length, 'at least one message in the batch').to.at.least(1);
  const messageId = response.data.Successful.slice(-1)[0].MessageId;
  expect(messageId, 'message id of last successful sent message').to.be.a('string');
  const receivedMessages = receiverControls.getIpcMessages();
  expect(receivedMessages, 'IPC messages must be an array').to.be.an('array');
  expect(receivedMessages, 'IPC messages has at least one item').to.have.lengthOf.at.least(1);
  const message = receivedMessages.filter(({ MessageId }) => MessageId === messageId)[0];
  expect(message, 'received message matches with sent message').to.exist;
  expect(message.Body).to.equal('Hello from Node tracer');
  return messageId;
}
