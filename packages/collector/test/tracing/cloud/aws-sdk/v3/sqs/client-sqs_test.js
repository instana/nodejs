/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const { v4: uuid } = require('uuid');
const semver = require('semver');
const bypassTest = semver.lt(process.versions.node, '10.0.0');
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
const { verifyHttpRootEntry, verifyHttpExit } = require('@instana/core/test/test_util/common_verifications');
const defaultPrefix = 'https://sqs.us-east-2.amazonaws.com/410797082306/';
const queueUrlPrefix = process.env.SQS_QUEUE_URL_PREFIX || defaultPrefix;

let createQueues;
let deleteQueues;
let sendMessageWithLegacyHeaders;
let sendSnsNotificationToSqsQueue;

// We need to add this verification as AWS SDK v3 relies on features not supported by Node version < 10
if (!bypassTest) {
  createQueues = require('./util').createQueues;
  deleteQueues = require('./util').deleteQueues;
  sendMessageWithLegacyHeaders = require('./sendNonInstrumented').sendMessageWithLegacyHeaders;
  sendSnsNotificationToSqsQueue = require('./sendNonInstrumented').sendSnsNotificationToSqsQueue;
}

let mochaSuiteFn;

const sendingMethods = ['v3', 'cb', 'v2'];
const receivingMethods = ['v3', 'cb', 'v2'];
const getNextSendMethod = require('@instana/core/test/test_util/circular_list').getCircularList(sendingMethods);
const getNextReceiveMethod = require('@instana/core/test/test_util/circular_list').getCircularList(receivingMethods);

if (!supportedVersion(process.versions.node) || bypassTest) {
  mochaSuiteFn = describe.skip;
} else {
  mochaSuiteFn = describe;
}
const retryTime = config.getTestTimeout() * 2;
const version = '@aws-sdk/client-sqs';

mochaSuiteFn('tracing/cloud/aws-sdk/v3/sqs', function () {
  describe(`version: ${version}`, function () {
    this.timeout(config.getTestTimeout() * 4);

    let queueName = 'team_nodejs';

    if (process.env.SQS_QUEUE_NAME) {
      queueName = `${process.env.SQS_QUEUE_NAME}-v3-${semver.major(process.versions.node)}-${uuid()}`;
    }

    const randomNumber = Math.floor(Math.random() * 1000);
    queueName = `${queueName}-${randomNumber}`;

    const queueURL = `${queueUrlPrefix}${queueName}`;
    const queueNames = [queueName, `${queueName}-consumer`, `${queueName}-batch`];
    const queueURLs = queueNames.map(name => `${queueUrlPrefix}${name}`);

    before(async () => {
      await createQueues(queueNames);
    });

    after(async () => {
      await deleteQueues(queueURLs);
    });

    globalAgent.setUpCleanUpHooks();
    const agentControls = globalAgent.instance;

    describe('tracing enabled, no suppression', function () {
      const senderControls = new ProcessControls({
        appPath: path.join(__dirname, 'sender'),
        port: 3215,
        useGlobalAgent: true,
        env: {
          AWS_SQS_QUEUE_URL: `${queueUrlPrefix}${queueName}`,
          AWS_SDK_CLIENT_SQS_REQUIRE: version
        }
      });

      const senderControlsSQSConsumer = new ProcessControls({
        appPath: path.join(__dirname, 'sender'),
        port: 3214,
        useGlobalAgent: true,
        env: {
          AWS_SQS_QUEUE_URL: `${queueUrlPrefix}${queueName}-consumer`,
          AWS_SDK_CLIENT_SQS_REQUIRE: version
        }
      });

      const senderControlsBatch = new ProcessControls({
        appPath: path.join(__dirname, 'sender'),
        port: 3213,
        useGlobalAgent: true,
        env: {
          AWS_SQS_QUEUE_URL: `${queueUrlPrefix}${queueName}-batch`,
          AWS_SDK_CLIENT_SQS_REQUIRE: version
        }
      });

      ProcessControls.setUpHooksWithRetryTime(retryTime, senderControls);
      ProcessControls.setUpHooksWithRetryTime(retryTime, senderControlsSQSConsumer);
      ProcessControls.setUpHooksWithRetryTime(retryTime, senderControlsBatch);

      receivingMethods.forEach(sqsReceiveMethod => {
        describe(`receiving via ${sqsReceiveMethod} API`, () => {
          const receiverControls = new ProcessControls({
            appPath: path.join(__dirname, 'receiver'),
            port: 3216,
            useGlobalAgent: true,
            env: {
              SQSV3_RECEIVE_METHOD: sqsReceiveMethod,
              AWS_SQS_QUEUE_URL: `${queueUrlPrefix}${queueName}`,
              AWS_SDK_CLIENT_SQS_REQUIRE: version
            }
          });

          ProcessControls.setUpHooksWithRetryTime(retryTime, receiverControls);

          [false, 'sender'].forEach(withError => {
            const sqsSendMethod = getNextSendMethod();
            const apiPath = `/send-message/${sqsSendMethod}`;
            const urlWithParams = withError ? apiPath + '?withError=true' : apiPath;

            it(`send(${sqsSendMethod}); receive(${sqsReceiveMethod}); error: ${!!withError}`, async () => {
              const response = await senderControls.sendRequest({
                method: 'GET',
                path: urlWithParams,
                simple: withError !== 'sender'
              });

              return verify(receiverControls, senderControls, response, apiPath, withError);
            });
          });

          it('falls back to legacy "S" headers if needed. eg: X_INSTANA_ST instead of X_INSTANA_T', async () => {
            const traceId = '1234';
            const spanId = '5678';
            await sendMessageWithLegacyHeaders(queueURL, traceId, spanId);
            return verifySingleSqsEntrySpanWithParent(traceId, spanId);
          });

          // eslint-disable-next-line max-len
          it('continues trace from a SNS notification routed to an SQS queue via SNS-to-SQS subscription', async () => {
            const traceId = 'abcdef9876543210';
            const spanId = '9876543210abcdef';
            await sendSnsNotificationToSqsQueue(queueURL, traceId, spanId);
            return verifySingleSqsEntrySpanWithParent(traceId, spanId);
          });

          it(
            'continues trace from a SNS notification routed to an SQS queue via SNS-to-SQS subscription ' +
              '(legacy headers)',
            async () => {
              const traceId = 'abcdef9876543210';
              const spanId = '9876543210abcdef';
              await sendSnsNotificationToSqsQueue(queueURL, traceId, spanId, true);
              return verifySingleSqsEntrySpanWithParent(traceId, spanId);
            }
          );
        });
      });

      /**
       * At the moment, SQS-Consumer does not support AWS SDK v3, although a PR exists in their repository:
       * https://github.com/bbc/sqs-consumer/pull/252
       */

      describe('messages sent in batch', () => {
        receivingMethods.forEach(sqsReceiveMethod => {
          describe(`receiving batched messages: ${sqsReceiveMethod}`, () => {
            const receiverControls = new ProcessControls({
              appPath: path.join(__dirname, 'receiver'),
              port: 3216,
              useGlobalAgent: true,
              env: {
                SQSV3_RECEIVE_METHOD: sqsReceiveMethod,
                AWS_SQS_QUEUE_URL: `${queueUrlPrefix}${queueName}-batch`,
                AWS_SDK_CLIENT_SQS_REQUIRE: version
              }
            });

            ProcessControls.setUpHooksWithRetryTime(retryTime, receiverControls);

            const sqsSendMethod = getNextSendMethod();
            const apiPath = `/send-message/${sqsSendMethod}`;

            it(`sending(${sqsSendMethod}); receiving(${sqsReceiveMethod})`, async () => {
              const response = await senderControlsBatch.sendRequest({
                method: 'GET',
                path: `${apiPath}?isBatch=true`
              });

              return verify(receiverControls, senderControlsBatch, response, apiPath, false, true);
            });
          });
        });
      });

      function verify(receiverControls, _senderControls, response, apiPath, withError, isBatch) {
        if (withError === 'sender') {
          expect(response.error).to.equal('MissingParameter: The request must contain the parameter MessageBody.');
        } else {
          return retry(() => {
            if (isBatch) {
              verifyResponseAndBatchMessage(response, receiverControls);
            } else {
              verifyResponseAndMessage(response, receiverControls);
            }
            return agentControls
              .getSpans()
              .then(spans => verifySpans(receiverControls, _senderControls, spans, apiPath, null, withError, isBatch));
          }, retryTime);
        }
      }

      function verifySingleSqsEntrySpanWithParent(traceId, spanId) {
        return retry(async () => {
          const spans = await agentControls.getSpans();
          return expectExactlyOneMatching(spans, [
            span => expect(span.t).to.equal(traceId),
            span => expect(span.p).to.equal(spanId),
            span => expect(span.k).to.equal(constants.ENTRY)
          ]);
        }, retryTime);
      }

      function verifySpans(receiverControls, _senderControls, spans, apiPath, messageId, withError, isBatch) {
        const httpEntry = verifyHttpRootEntry({ spans, apiPath, pid: String(_senderControls.getPid()) });
        const sqsExit = verifySQSExit(_senderControls, spans, httpEntry, messageId, withError);
        verifyHttpExit({ spans, parent: httpEntry, pid: String(_senderControls.getPid()) });

        if (withError !== 'publisher') {
          const sqsEntry = verifySQSEntry(receiverControls, spans, sqsExit, messageId, withError, isBatch);
          verifyHttpExit({ spans, parent: sqsEntry, pid: String(receiverControls.getPid()) });
        }
      }

      function verifySQSEntry(receiverControls, spans, parent, messageId, withError, isBatch) {
        let operation = expectExactlyOneMatching;

        /**
         * When receiving messages in batch, we can have more than one span that matches the criteria because
         * SQS may not send all messages in one batch, thus we cannot guarantee that all messages will be in
         * the batch.
         *
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
        appPath: path.join(__dirname, 'sender'),
        port: 3215,
        useGlobalAgent: true,
        tracingEnabled: false,
        env: {
          AWS_SQS_QUEUE_URL: `${queueUrlPrefix}${queueName}`,
          AWS_SDK_CLIENT_SQS_REQUIRE: version
        }
      });

      ProcessControls.setUpHooksWithRetryTime(retryTime, senderControls);

      const receivingMethod = getNextReceiveMethod();
      describe('sending and receiving', () => {
        const receiverControls = new ProcessControls({
          appPath: path.join(__dirname, 'receiver'),
          port: 3216,
          useGlobalAgent: true,
          tracingEnabled: false,
          env: {
            SQSV3_RECEIVE_METHOD: receivingMethod,
            AWS_SQS_QUEUE_URL: `${queueUrlPrefix}${queueName}`,
            AWS_SDK_CLIENT_SQS_REQUIRE: version
          }
        });

        ProcessControls.setUpHooksWithRetryTime(retryTime, receiverControls);

        const sendingMethod = getNextSendMethod();
        it(`should not trace for sending(${sendingMethod}) / receiving(${receivingMethod})`, async () => {
          const response = await senderControls.sendRequest({
            method: 'GET',
            path: `/send-message/${sendingMethod}`
          });

          return retry(() => verifyResponseAndMessage(response, receiverControls), retryTime)
            .then(() => delay(config.getTestTimeout() / 4))
            .then(() => agentControls.getSpans())
            .then(spans => {
              if (spans.length > 0) {
                fail(`Unexpected spans (AWS SQS v3 suppressed: ${stringifyItems(spans)}`);
              }
            });
        });
      });
    });

    describe('tracing enabled but suppressed', () => {
      const senderControls = new ProcessControls({
        appPath: path.join(__dirname, 'sender'),
        port: 3215,
        useGlobalAgent: true,
        env: {
          AWS_SQS_QUEUE_URL: `${queueUrlPrefix}${queueName}`,
          AWS_SDK_CLIENT_SQS_REQUIRE: version
        }
      });

      ProcessControls.setUpHooksWithRetryTime(retryTime, senderControls);

      const receivingMethod = getNextReceiveMethod();
      describe('tracing suppressed', () => {
        const receiverControls = new ProcessControls({
          appPath: path.join(__dirname, 'receiver'),
          port: 3216,
          useGlobalAgent: true,
          env: {
            SQSV3_RECEIVE_METHOD: receivingMethod,
            AWS_SQS_QUEUE_URL: `${queueUrlPrefix}${queueName}`,
            AWS_SDK_CLIENT_SQS_REQUIRE: version
          }
        });

        ProcessControls.setUpHooksWithRetryTime(retryTime, receiverControls);

        const sendingMethod = getNextSendMethod();
        it(`doesn't trace when sending(${sendingMethod}) and receiving(${receivingMethod})`, async () => {
          const response = await senderControls.sendRequest({
            method: 'GET',
            path: `/send-message/${sendingMethod}`,
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
                fail(`Unexpected spans (AWS SQS v3 suppressed: ${stringifyItems(spans)}`);
              }
            });
        });
      });
    });

    describe('tracing enabled with wrong queue name', () => {
      const receiverControls = new ProcessControls({
        appPath: path.join(__dirname, 'receiver'),
        port: 3216,
        useGlobalAgent: true,
        env: {
          SQSV3_RECEIVE_METHOD: 'v3',
          AWS_SQS_QUEUE_URL: queueURL + '-non-existent',
          AWS_SDK_CLIENT_SQS_REQUIRE: version
        }
      });

      ProcessControls.setUpHooksWithRetryTime(retryTime, receiverControls);

      it('reports an error span', async () => {
        await retry(() => delay(config.getTestTimeout() / 4), retryTime);
        const spans = await agentControls.getSpans();

        return expectAtLeastOneMatching(spans, [
          span => expect(span.ec).equal(1),
          span => expect(span.data.sqs.error).to.equal('The specified queue does not exist for this wsdl version.')
        ]);
      });
    });
  });
});

function verifyResponseAndMessage(response, receiverControls) {
  expect(response).to.be.an('object');
  const messageId = response.result.MessageId;
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
  expect(response.result).to.be.an('object');
  expect(response.result.Successful.length, 'at least one message in the batch').to.at.least(1);
  const messageId = response.result.Successful.slice(-1)[0].MessageId;
  expect(messageId, 'message id of last successful sent message').to.be.a('string');
  const receivedMessages = receiverControls.getIpcMessages();
  expect(receivedMessages, 'IPC messages must be an array').to.be.an('array');
  expect(receivedMessages, 'IPC messages has at least one item').to.have.lengthOf.at.least(1);
  const message = receivedMessages.filter(({ MessageId }) => MessageId === messageId)[0];
  expect(message, 'received message matches with sent message').to.exist;
  expect(message.Body).to.equal('Hello from Node tracer');
  return messageId;
}
