/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const { v4: uuid } = require('uuid');
const { createQueues, deleteQueues } = require('./sqsUtil');
const semver = require('semver');
const path = require('path');
const { expect } = require('chai');
const { fail } = expect;
const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../../../core/test/config');
const {
  expectExactlyOneMatching,
  expectAtLeastOneMatching,
  retry,
  delay,
  stringifyItems
} = require('../../../../../../../core/test/test_util');
const ProcessControls = require('../../../../../test_util/ProcessControls');
const globalAgent = require('../../../../../globalAgent');
const { sendMessageWithLegacyHeaders, sendSnsNotificationToSqsQueue } = require('./sendNonInstrumented');
const { verifyHttpRootEntry, verifyHttpExit } = require('@instana/core/test/test_util/common_verifications');
const defaultPrefix = 'https://sqs.us-east-2.amazonaws.com/410797082306/';
const queueUrlPrefix = process.env.SQS_QUEUE_URL_PREFIX || defaultPrefix;

const queueNamePrefix = process.env.SQS_QUEUE_NAME || 'nodejs-team';
const queueName = `${queueNamePrefix}${semver.major(process.versions.node)}-${uuid()}`;
const queueURL = `${queueUrlPrefix}${queueName}`;

let mochaSuiteFn;

const sendingMethods = ['callback', 'promise'];
const receivingMethods = ['callback', 'promise', 'async'];
const queueNames = [queueName, `${queueName}-consumer`, `${queueName}-batch`];
const queueURLs = queueNames.map(name => `${queueUrlPrefix}${name}`);

const getNextSendMethod = require('@instana/core/test/test_util/circular_list').getCircularList(sendingMethods);
const getNextReceiveMethod = require('@instana/core/test/test_util/circular_list').getCircularList(receivingMethods);

if (!supportedVersion(process.versions.node)) {
  mochaSuiteFn = describe.skip;
} else {
  mochaSuiteFn = describe;
}
const retryTime = config.getTestTimeout() * 2;

mochaSuiteFn('tracing/cloud/aws-sdk/v2/sqs', function () {
  this.timeout(config.getTestTimeout() * 4);
  before(async () => {
    await createQueues(queueNames);
  });

  after(async () => {
    await deleteQueues(queueURLs);
  });

  this.timeout(config.getTestTimeout() * 3);

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  describe('tracing enabled, no suppression', function () {
    const senderControls = new ProcessControls({
      appPath: path.join(__dirname, 'sendMessage'),
      port: 3215,
      useGlobalAgent: true,
      env: {
        AWS_SQS_QUEUE_URL: `${queueUrlPrefix}${queueName}`
      }
    });

    const senderControlsSQSConsumer = new ProcessControls({
      appPath: path.join(__dirname, 'sendMessage'),
      port: 3214,
      useGlobalAgent: true,
      env: {
        AWS_SQS_QUEUE_URL: `${queueUrlPrefix}${queueName}-consumer`
      }
    });

    const senderControlsBatch = new ProcessControls({
      appPath: path.join(__dirname, 'sendMessage'),
      port: 3213,
      useGlobalAgent: true,
      env: {
        AWS_SQS_QUEUE_URL: `${queueUrlPrefix}${queueName}-batch`
      }
    });

    ProcessControls.setUpHooksWithRetryTime(retryTime, senderControls);
    ProcessControls.setUpHooksWithRetryTime(retryTime, senderControlsSQSConsumer);
    ProcessControls.setUpHooksWithRetryTime(retryTime, senderControlsBatch);

    receivingMethods.forEach(sqsReceiveMethod => {
      describe(`receiving via ${sqsReceiveMethod} API`, () => {
        const receiverControls = new ProcessControls({
          appPath: path.join(__dirname, 'receiveMessage'),
          port: 3216,
          useGlobalAgent: true,
          env: {
            SQS_RECEIVE_METHOD: sqsReceiveMethod,
            AWS_SQS_QUEUE_URL: `${queueUrlPrefix}${queueName}`
          }
        });

        ProcessControls.setUpHooksWithRetryTime(retryTime, receiverControls);

        [false, 'sender'].forEach(withError => {
          const sqsSendMethod = getNextSendMethod();
          const apiPath = `/send-${sqsSendMethod}`;
          const urlWithParams = withError ? `${apiPath}?withError=true` : apiPath;

          it(`send(${sqsSendMethod}); receive(${sqsReceiveMethod}); error: ${!!withError}`, async () => {
            const response = await senderControls.sendRequest({
              method: 'POST',
              path: urlWithParams,
              simple: withError !== 'sender'
            });

            await verify(receiverControls, senderControls, response, apiPath, withError);
            await verifyNoUnclosedSpansHaveBeenDetected(receiverControls);
          });
        });

        it('falls back to legacy "S" headers if needed. eg: X_INSTANA_ST instead of X_INSTANA_T', async () => {
          const traceId = '1234';
          const spanId = '5678';
          await sendMessageWithLegacyHeaders(queueURL, traceId, spanId);
          await verifySingleSqsEntrySpanWithParent(traceId, spanId);
          await verifyNoUnclosedSpansHaveBeenDetected(receiverControls);
        });

        it('continues trace from a SNS notification routed to an SQS queue via SNS-to-SQS subscription', async () => {
          const traceId = 'abcdef9876543210';
          const spanId = '9876543210abcdef';
          await sendSnsNotificationToSqsQueue(queueURL, traceId, spanId);
          await verifySingleSqsEntrySpanWithParent(traceId, spanId);
          await verifyNoUnclosedSpansHaveBeenDetected(receiverControls);
        });

        it(
          'continues trace from a SNS notification routed to an SQS queue via SNS-to-SQS subscription ' +
            '(legacy headers)',
          async () => {
            const traceId = 'abcdef9876543210';
            const spanId = '9876543210abcdef';
            await sendSnsNotificationToSqsQueue(queueURL, traceId, spanId, true);
            await verifySingleSqsEntrySpanWithParent(traceId, spanId);
            await verifyNoUnclosedSpansHaveBeenDetected(receiverControls);
          }
        );
      });

      describe(`polling via ${sqsReceiveMethod} when no messages are available`, () => {
        const receiverControls = new ProcessControls({
          appPath: path.join(__dirname, 'receiveMessage'),
          port: 3216,
          useGlobalAgent: true,
          env: {
            SQS_RECEIVE_METHOD: sqsReceiveMethod,
            SQS_POLL_DELAY: 1,
            AWS_SQS_QUEUE_URL: `${queueUrlPrefix}${queueName}`
          }
        });

        ProcessControls.setUpHooksWithRetryTime(retryTime, receiverControls);

        it(
          `consecutive receiveMessage calls via ${sqsReceiveMethod} in the same event loop tick should not ` +
            'trigger a warning',
          async () => {
            await retry(async () => {
              const numberOfMessagePolls = await receiverControls.sendRequest({
                path: '/number-of-receive-message-attempts',
                suppressTracing: true
              });
              // Make sure the receiver has started to poll for messages at least twice.
              expect(numberOfMessagePolls).to.be.at.least(2);
            }, retryTime);

            // There should be no spans since we do not send any SQS messages in this test and we also do not send
            // HTTP requests to the sender.
            const spans = await agentControls.getSpans();
            expect(spans).to.be.empty;

            await verifyNoUnclosedSpansHaveBeenDetected(receiverControls);
          }
        );
      });
    });

    describe('message header limits', function () {
      const receiverControls = new ProcessControls({
        appPath: path.join(__dirname, 'receiveMessage'),
        port: 3216,
        useGlobalAgent: true,
        env: {
          SQS_RECEIVE_METHOD: 'async',
          AWS_SQS_QUEUE_URL: `${queueUrlPrefix}${queueName}`
        }
      });

      ProcessControls.setUpHooksWithRetryTime(retryTime, receiverControls);

      const apiPath = '/send-callback';

      it('creates spans but does not add correlation headers ', async () => {
        const response = await senderControls.sendRequest({
          method: 'POST',
          path: `${apiPath}?addHeaders=9`
        });

        await retry(async () => {
          verifyResponseAndMessage(response, receiverControls);
          const spans = await agentControls.getSpans();

          const httpEntry = verifyHttpRootEntry({ spans, apiPath, pid: String(senderControls.getPid()) });
          verifySQSExit(senderControls, spans, httpEntry);

          // The SQS entry will be the root of a new trace because we were not able to add tracing headers.
          const sqsEntry = verifySQSEntry(receiverControls, spans, null);
          verifyHttpExit({ spans, parent: sqsEntry, pid: String(receiverControls.getPid()) });
        }, retryTime);

        await verifyNoUnclosedSpansHaveBeenDetected(receiverControls);
      });
    });

    describe('sqs-consumer API', () => {
      describe('message processed with success', () => {
        const sqsConsumerControls = new ProcessControls({
          appPath: path.join(__dirname, 'sqs-consumer'),
          port: 3216,
          useGlobalAgent: true,
          env: {
            AWS_SQS_QUEUE_URL: `${queueUrlPrefix}${queueName}-consumer`
          }
        });

        ProcessControls.setUpHooksWithRetryTime(retryTime, sqsConsumerControls);

        const apiPath = '/send-callback';

        it('receives message', async () => {
          const response = await senderControlsSQSConsumer.sendRequest({
            method: 'POST',
            path: apiPath
          });

          await verify(sqsConsumerControls, senderControlsSQSConsumer, response, apiPath, false);
        });
      });

      describe('message not processed with success', () => {
        const sqsConsumerControls = new ProcessControls({
          appPath: path.join(__dirname, 'sqs-consumer'),
          port: 3216,
          useGlobalAgent: true,
          env: {
            AWS_SQS_QUEUE_URL: `${queueUrlPrefix}${queueName}-consumer`,
            AWS_SQS_RECEIVER_ERROR: 'true'
          }
        });

        ProcessControls.setUpHooksWithRetryTime(retryTime, sqsConsumerControls);

        const apiPath = '/send-callback';

        it('fails to receive a message', async () => {
          const response = await senderControlsSQSConsumer.sendRequest({
            method: 'POST',
            path: apiPath
          });

          await verify(sqsConsumerControls, senderControlsSQSConsumer, response, apiPath, 'receiver');
        });
      });
    });

    describe('messages sent in batch', () => {
      receivingMethods.forEach(sqsReceiveMethod => {
        describe(`receiving batched messages: ${sqsReceiveMethod}`, () => {
          const receiverControls = new ProcessControls({
            appPath: path.join(__dirname, 'receiveMessage'),
            port: 3216,
            useGlobalAgent: true,
            env: {
              SQS_RECEIVE_METHOD: sqsReceiveMethod,
              AWS_SQS_QUEUE_URL: `${queueUrlPrefix}${queueName}-batch`
            }
          });

          ProcessControls.setUpHooksWithRetryTime(retryTime, receiverControls);

          const sqsSendMethod = getNextSendMethod();
          const apiPath = `/send-${sqsSendMethod}`;

          it(`sending(${sqsSendMethod}); receiving(${sqsReceiveMethod})`, async () => {
            const response = await senderControlsBatch.sendRequest({
              method: 'POST',
              path: `${apiPath}?isBatch=1`
            });

            await verify(receiverControls, senderControlsBatch, response, apiPath, false, true);
          });
        });
      });
    });

    async function verify(receiverControls, _senderControls, response, apiPath, withError, isBatch) {
      if (withError === 'sender') {
        expect(response.data).to.equal("MissingRequiredParameter: Missing required key 'MessageBody' in params");
      } else {
        await retry(async () => {
          if (isBatch) {
            verifyResponseAndBatchMessage(response, receiverControls);
          } else {
            verifyResponseAndMessage(response, receiverControls);
          }
          const spans = await agentControls.getSpans();
          verifySpans(receiverControls, _senderControls, spans, apiPath, null, withError, isBatch);
        }, retryTime);
      }
    }

    async function verifySingleSqsEntrySpanWithParent(traceId, spanId) {
      await retry(async () => {
        const spans = await agentControls.getSpans();
        expectExactlyOneMatching(spans, [
          span => expect(span.t).to.equal(traceId),
          span => expect(span.p).to.equal(spanId),
          span => expect(span.k).to.equal(constants.ENTRY)
        ]);
      }, retryTime);
    }

    function verifySpans(receiverControls, _senderControls, spans, apiPath, messageId, withError, isBatch) {
      const httpEntry = verifyHttpRootEntry({ spans, apiPath, pid: String(_senderControls.getPid()) });
      const sqsExit = verifySQSExit(_senderControls, spans, httpEntry, messageId, withError);

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
        span => (parent ? expect(span.t).to.equal(parent.t) : expect(span.t).to.be.a('string')),
        span => (parent ? expect(span.p).to.equal(parent.s) : expect(span.p).to.not.exist),
        span => expect(span.f.e).to.equal(String(receiverControls.getPid())),
        span => expect(span.f.h).to.equal('agent-stub-uuid'),
        span => {
          if (withError === 'receiver') {
            expect(span.data.sqs.error).to.match(/Forced error/);
          } else {
            expect(span.data.sqs.error).to.not.exist;
          }
        },
        span => expect(span.ec).to.equal(withError === 'receiver' ? 1 : 0),
        span => expect(span.async).to.not.exist,
        span => expect(span.data).to.exist,
        span => expect(span.data.sqs).to.be.an('object'),
        span => expect(span.data.sqs.sort).to.equal('entry'),
        span => expect(span.data.sqs.queue).to.match(new RegExp(`^${queueUrlPrefix}${queueName}`)),
        span => expect(span.data.sqs.size).to.be.an('number'),
        span => {
          if (!isBatch) {
            // This makes sure that the span end time is logged properly
            expect(span.d).to.greaterThan(1000);
          }
        }
      ]);
    }

    function verifySQSExit(_senderControls, spans, parent, messageId, withError) {
      return expectExactlyOneMatching(spans, [
        span => expect(span.n).to.equal('sqs'),
        span => expect(span.k).to.equal(constants.EXIT),
        span => expect(span.t).to.equal(parent.t),
        span => expect(span.p).to.equal(parent.s),
        span => expect(span.f.e).to.equal(String(_senderControls.getPid())),
        span => expect(span.f.h).to.equal('agent-stub-uuid'),
        span => expect(span.error).to.not.exist,
        span => expect(span.ec).to.equal(withError === 'sender' ? 1 : 0),
        span => expect(span.async).to.not.exist,
        span => expect(span.data).to.exist,
        span => expect(span.data.sqs).to.be.an('object'),
        span => expect(span.data.sqs.sort).to.equal('exit'),
        span => expect(span.data.sqs.queue).to.match(new RegExp(`^${queueUrlPrefix}${queueName}`))
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
        AWS_SQS_QUEUE_URL: `${queueUrlPrefix}${queueName}`
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
          AWS_SQS_QUEUE_URL: `${queueUrlPrefix}${queueName}`
        }
      });

      ProcessControls.setUpHooksWithRetryTime(retryTime, receiverControls);

      const sendingMethod = getNextSendMethod();
      it(`should not trace for sending(${sendingMethod}) / receiving(${receivingMethod})`, async () => {
        const response = await senderControls.sendRequest({
          method: 'POST',
          path: `/send-${sendingMethod}`
        });

        await retry(() => verifyResponseAndMessage(response, receiverControls), retryTime);
        await delay(config.getTestTimeout() / 4);
        const spans = await agentControls.getSpans();
        if (spans.length > 0) {
          fail(`Unexpected spans (AWS SQS suppressed: ${stringifyItems(spans)}`);
        }
      });
    });
  });

  describe('tracing enabled but suppressed', () => {
    const senderControls = new ProcessControls({
      appPath: path.join(__dirname, 'sendMessage'),
      port: 3215,
      useGlobalAgent: true,
      env: {
        AWS_SQS_QUEUE_URL: `${queueUrlPrefix}${queueName}`
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
          AWS_SQS_QUEUE_URL: `${queueUrlPrefix}${queueName}`
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

        await retry(() => verifyResponseAndMessage(response, receiverControls), retryTime);
        await delay(config.getTestTimeout() / 4);
        const spans = await agentControls.getSpans();
        if (spans.length > 0) {
          fail(`Unexpected spans (AWS SQS suppressed: ${stringifyItems(spans)}`);
        }

        await verifyNoUnclosedSpansHaveBeenDetected(receiverControls);
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
        AWS_SQS_QUEUE_URL: `${queueURL}-non-existent`
      }
    });

    ProcessControls.setUpHooksWithRetryTime(retryTime, receiverControls);

    it('reports an error span', async () => {
      await retry(() => delay(config.getTestTimeout() / 4), retryTime);
      const spans = await agentControls.getSpans();

      expectAtLeastOneMatching(spans, [
        span => expect(span.ec).equal(1),
        span => expect(span.data.sqs.error).to.equal('The specified queue does not exist for this wsdl version.')
      ]);

      await verifyNoUnclosedSpansHaveBeenDetected(receiverControls);
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

/**
 * Verify that the warning "Cannot start an AWS SQS entry span when another span is already active."
 * has not been logged. That log message would indicate that we did not correctly cancel the SQS entry span that had
 * been started for the previous sqs.receiveMessage invocation.
 */
async function verifyNoUnclosedSpansHaveBeenDetected(receiverControls) {
  let warnLogs = await receiverControls.sendRequest({
    path: '/warn-logs',
    suppressTracing: true
  });
  warnLogs = warnLogs.filter(msg => msg.includes('Cannot start'));
  if (warnLogs.length > 0) {
    fail(`Unexpected warnings have been logged: ${JSON.stringify(warnLogs)}`);
  }
}
