/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const { v4: uuid } = require('uuid');
const semver = require('semver');
const { expect } = require('chai');
const { fail } = expect;
const constants = require('@_local/core').tracing.constants;
const supportedVersion = require('@_local/core').tracing.supportedVersion;
const config = require('@_local/core/test/config');
const {
  expectExactlyOneMatching,
  expectAtLeastOneMatching,
  retry,
  delay,
  stringifyItems,
  expectExactlyNMatching
} = require('@_local/core/test/test_util');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const globalAgent = require('@_local/collector/test/globalAgent');
const { verifyHttpRootEntry, verifyHttpExit } = require('@_local/core/test/test_util/common_verifications');
const defaultPrefix = 'https://sqs.us-east-2.amazonaws.com/767398002385/';
const queueUrlPrefix = process.env.SQS_QUEUE_URL_PREFIX || defaultPrefix;

const { createQueues, deleteQueues, sendSnsNotificationToSqsQueue } = require('./util');

const sendingMethods = ['v3', 'cb', 'v2'];
const receivingMethods = ['v3', 'cb', 'v2'];

const getNextSendMethod = require('@_local/core/test/test_util/circular_list').getCircularList(sendingMethods);
const getNextReceiveMethod = require('@_local/core/test/test_util/circular_list').getCircularList(receivingMethods);

let libraryEnv;

function start() {
  const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

  // v12, the `sqs-consumer` library has dropped support for Node.js versions earlier than v20.
  // The minimum supported Node.js version is now v20.
  // Reference: https://github.com/bbc/sqs-consumer/blob/main/package.json#L21
  const runSqsConsumerAPI =
    supportedVersion(process.versions.node) && semver.gte(process.versions.node, '20.0.0') ? describe : describe.skip;

  mochaSuiteFn(`npm: ${libraryEnv.LIBRARY_NAME}`, function () {
    this.timeout(config.getTestTimeout() * 4);

    let queueName = 'nodejs-team';

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
      let senderControls;
      let senderControlsSQSConsumer;
      let senderControlsBatch;

      before(async () => {
        senderControls = new ProcessControls({
          dirname: __dirname,
          appName: 'sender.js',
          useGlobalAgent: true,
          env: {
            ...libraryEnv,
            AWS_SQS_QUEUE_URL: `${queueUrlPrefix}${queueName}`
          }
        });
        senderControlsSQSConsumer = new ProcessControls({
          dirname: __dirname,
          appName: 'sender.js',
          useGlobalAgent: true,
          env: {
            ...libraryEnv,
            AWS_SQS_QUEUE_URL: `${queueUrlPrefix}${queueName}-consumer`
          }
        });
        senderControlsBatch = new ProcessControls({
          dirname: __dirname,
          appName: 'sender.js',
          useGlobalAgent: true,
          env: {
            ...libraryEnv,
            AWS_SQS_QUEUE_URL: `${queueUrlPrefix}${queueName}-batch`
          }
        });

        await senderControls.startAndWaitForAgentConnection();
        await senderControlsSQSConsumer.startAndWaitForAgentConnection();
        await senderControlsBatch.startAndWaitForAgentConnection();
      });

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });

      after(async () => {
        await senderControls.stop();
        await senderControlsSQSConsumer.stop();
        await senderControlsBatch.stop();
      });

      afterEach(async () => {
        await senderControls.clearIpcMessages();
        await senderControlsSQSConsumer.clearIpcMessages();
        await senderControlsBatch.clearIpcMessages();
      });

      receivingMethods.forEach(sqsReceiveMethod => {
        describe(`receiving via ${sqsReceiveMethod} API`, () => {
          let receiverControls;

          before(async () => {
            receiverControls = new ProcessControls({
              dirname: __dirname,
              appName: 'receiver.js',
              useGlobalAgent: true,
              env: {
                ...libraryEnv,
                SQSV3_RECEIVE_METHOD: sqsReceiveMethod,
                AWS_SQS_QUEUE_URL: `${queueUrlPrefix}${queueName}`
              }
            });

            await receiverControls.startAndWaitForAgentConnection();
          });

          beforeEach(async () => {
            await agentControls.clearReceivedTraceData();
          });

          after(async () => {
            await receiverControls.stop();
          });

          afterEach(async () => {
            await receiverControls.clearIpcMessages();
          });

          [false, 'sender'].forEach(withError => {
            const sqsSendMethod = getNextSendMethod();
            const apiPath = `/send-message/${sqsSendMethod}`;
            const urlWithParams = withError ? `${apiPath}?withError=true` : apiPath;

            it(`send(${sqsSendMethod}); receive(${sqsReceiveMethod}); error: ${!!withError}`, async () => {
              const response = await senderControls.sendRequest({
                method: 'GET',
                path: urlWithParams,
                simple: withError !== 'sender'
              });

              await verify({ receiverControls, senderControls, response, apiPath, withError });
              await verifyNoUnclosedSpansHaveBeenDetected(receiverControls);
            });
          });

          // eslint-disable-next-line max-len
          it('continues trace from a SNS notification routed to an SQS queue via SNS-to-SQS subscription', async () => {
            const traceId = 'abcdef9876543210';
            const spanId = '9876543210abcdef';
            await sendSnsNotificationToSqsQueue(queueURL, traceId, spanId);
            await verifySingleSqsEntrySpanWithParent(traceId, spanId);
            await verifyNoUnclosedSpansHaveBeenDetected(receiverControls);
          });
        });

        describe(`polling via ${sqsReceiveMethod} when no messages are available`, () => {
          let receiverControls;

          before(async () => {
            receiverControls = new ProcessControls({
              dirname: __dirname,
              appName: 'receiver.js',
              useGlobalAgent: true,
              env: {
                ...libraryEnv,
                SQSV3_RECEIVE_METHOD: sqsReceiveMethod,
                SQS_POLL_DELAY: 1,
                AWS_SQS_QUEUE_URL: `${queueUrlPrefix}${queueName}`
              }
            });

            await receiverControls.startAndWaitForAgentConnection();
          });

          beforeEach(async () => {
            await agentControls.clearReceivedTraceData();
          });

          after(async () => {
            await receiverControls.stop();
          });

          afterEach(async () => {
            await receiverControls.clearIpcMessages();
          });

          it(
            `consecutive receiveMessage calls via ${sqsReceiveMethod} in the same event loop tick should not ` +
              'trigger a warning',
            async () => {
              retry(async () => {
                const numberOfMessagePolls = await receiverControls.sendRequest({
                  path: '/number-of-receive-message-attempts',
                  suppressTracing: true
                });
                // Make sure the receiver has started to poll for messages at least twice.
                expect(numberOfMessagePolls).to.be.at.least(2);
              }, 1000);

              // There should be no spans since we do not send any SQS messages in this test and we also do not send
              // HTTP requests to the sender.
              const spans = await agentControls.getSpans();
              expect(spans).to.be.empty;

              await verifyNoUnclosedSpansHaveBeenDetected(receiverControls);
            }
          );
        });
      });

      runSqsConsumerAPI('sqs-consumer API', () => {
        describe('[handleMessage] message processed with success', () => {
          let sqsConsumerControls;

          before(async () => {
            sqsConsumerControls = new ProcessControls({
              dirname: __dirname,
              appName: 'sqs-consumer.js',
              useGlobalAgent: true,
              env: {
                ...libraryEnv,
                AWS_SQS_QUEUE_URL: `${queueUrlPrefix}${queueName}-consumer`
              }
            });

            await sqsConsumerControls.startAndWaitForAgentConnection();
          });

          beforeEach(async () => {
            await agentControls.clearReceivedTraceData();
          });
          after(async () => {
            await sqsConsumerControls.stop();
          });

          afterEach(async () => {
            await sqsConsumerControls.clearIpcMessages();
          });

          const apiPath = '/send-message/v3';

          it('receives message', async () => {
            const response = await senderControlsSQSConsumer.sendRequest({
              method: 'GET',
              path: apiPath
            });

            await verify({
              receiverControls: sqsConsumerControls,
              senderControls: senderControlsSQSConsumer,
              response,
              apiPath,
              withError: false,
              isBatch: false
            });
          });

          it('receives messages', async () => {
            const response = await senderControlsSQSConsumer.sendRequest({
              method: 'GET',
              path: `${apiPath}?isBatch=true`
            });

            await verify({
              receiverControls: sqsConsumerControls,
              senderControls: senderControlsSQSConsumer,
              response,
              apiPath,
              withError: false,
              isBatch: true
            });
          });
        });

        describe('[handleMessageBatch] message processed with success', () => {
          let sqsConsumerControls;

          before(async () => {
            sqsConsumerControls = new ProcessControls({
              dirname: __dirname,
              appName: 'sqs-consumer.js',
              useGlobalAgent: true,
              env: {
                ...libraryEnv,
                AWS_SQS_QUEUE_URL: `${queueUrlPrefix}${queueName}-consumer`,
                HANDLE_MESSAGE_BATCH: true
              }
            });

            await sqsConsumerControls.startAndWaitForAgentConnection();
          });

          beforeEach(async () => {
            await agentControls.clearReceivedTraceData();
          });

          after(async () => {
            await sqsConsumerControls.stop();
          });

          afterEach(async () => {
            await sqsConsumerControls.clearIpcMessages();
          });

          const apiPath = '/send-message/v3';

          it('receives message', async () => {
            const response = await senderControlsSQSConsumer.sendRequest({
              method: 'GET',
              path: apiPath
            });
            await verify({
              receiverControls: sqsConsumerControls,
              senderControls: senderControlsSQSConsumer,
              response,
              apiPath,
              withError: false,
              isBatch: false
            });
          });

          it('receives messages', async () => {
            const response = await senderControlsSQSConsumer.sendRequest({
              method: 'GET',
              path: `${apiPath}?isBatch=true`
            });

            await verify({
              receiverControls: sqsConsumerControls,
              senderControls: senderControlsSQSConsumer,
              response,
              apiPath,
              withError: false,
              isBatch: true,
              isSQSConsumer: true
            });
          });
        });

        describe('message not processed with success', () => {
          let sqsConsumerControls;

          before(async () => {
            sqsConsumerControls = new ProcessControls({
              dirname: __dirname,
              appName: 'sqs-consumer.js',
              useGlobalAgent: true,
              env: {
                ...libraryEnv,
                AWS_SQS_QUEUE_URL: `${queueUrlPrefix}${queueName}-consumer`,
                AWS_SQS_RECEIVER_ERROR: 'true'
              }
            });

            await sqsConsumerControls.startAndWaitForAgentConnection();
          });

          beforeEach(async () => {
            await agentControls.clearReceivedTraceData();
          });

          after(async () => {
            await sqsConsumerControls.stop();
          });

          afterEach(async () => {
            await sqsConsumerControls.clearIpcMessages();
          });

          const apiPath = '/send-message/v3';

          it('fails to receive a message', async () => {
            const response = await senderControlsSQSConsumer.sendRequest({
              method: 'GET',
              path: apiPath
            });

            await verify({
              receiverControls: sqsConsumerControls,
              senderControls: senderControlsSQSConsumer,
              response,
              apiPath,
              withError: 'receiver',
              isBatch: false
            });
          });
        });
      });

      describe('messages sent in batch', () => {
        receivingMethods.forEach(sqsReceiveMethod => {
          describe(`receiving batched messages: ${sqsReceiveMethod}`, () => {
            let receiverControls;

            before(async () => {
              receiverControls = new ProcessControls({
                dirname: __dirname,
                appName: 'receiver.js',
                useGlobalAgent: true,
                env: {
                  ...libraryEnv,
                  SQSV3_RECEIVE_METHOD: sqsReceiveMethod,
                  AWS_SQS_QUEUE_URL: `${queueUrlPrefix}${queueName}-batch`
                }
              });

              await receiverControls.startAndWaitForAgentConnection();
            });

            beforeEach(async () => {
              await agentControls.clearReceivedTraceData();
            });

            after(async () => {
              await receiverControls.stop();
            });

            afterEach(async () => {
              await receiverControls.clearIpcMessages();
            });

            const sqsSendMethod = getNextSendMethod();
            const apiPath = `/send-message/${sqsSendMethod}`;

            it(`sending(${sqsSendMethod}); receiving(${sqsReceiveMethod})`, async () => {
              const response = await senderControlsBatch.sendRequest({
                method: 'GET',
                path: `${apiPath}?isBatch=true`
              });

              await verify({
                receiverControls,
                senderControls: senderControlsBatch,
                response,
                apiPath,
                withError: false,
                isBatch: true
              });
              await verifyNoUnclosedSpansHaveBeenDetected(receiverControls);
            });
          });
        });
      });
    });

    describe('tracing disabled', () => {
      this.timeout(config.getTestTimeout() * 2);
      let senderControls;

      before(async () => {
        senderControls = new ProcessControls({
          dirname: __dirname,
          appName: 'sender.js',
          useGlobalAgent: true,
          tracingEnabled: false,
          env: {
            ...libraryEnv,
            AWS_SQS_QUEUE_URL: `${queueUrlPrefix}${queueName}`
          }
        });

        await senderControls.startAndWaitForAgentConnection();
      });

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });

      after(async () => {
        await senderControls.stop();
      });

      afterEach(async () => {
        await senderControls.clearIpcMessages();
      });

      const receivingMethod = getNextReceiveMethod();

      describe('sending and receiving', () => {
        let receiverControls;

        before(async () => {
          receiverControls = new ProcessControls({
            dirname: __dirname,
            appName: 'receiver.js',
            useGlobalAgent: true,
            tracingEnabled: false,
            env: {
              ...libraryEnv,
              SQSV3_RECEIVE_METHOD: receivingMethod,
              AWS_SQS_QUEUE_URL: `${queueUrlPrefix}${queueName}`
            }
          });

          await receiverControls.startAndWaitForAgentConnection();
        });

        beforeEach(async () => {
          await agentControls.clearReceivedTraceData();
        });

        after(async () => {
          await receiverControls.stop();
        });

        afterEach(async () => {
          await receiverControls.clearIpcMessages();
        });

        const sendingMethod = getNextSendMethod();
        it(`should not trace for sending(${sendingMethod}) / receiving(${receivingMethod})`, async () => {
          const response = await senderControls.sendRequest({
            method: 'GET',
            path: `/send-message/${sendingMethod}`
          });

          await retry(async () => {
            await verifyResponseAndMessage(response, receiverControls);
          }, 1000);

          await delay(1000);
          const spans = await agentControls.getSpans();
          if (spans.length > 0) {
            fail(`Unexpected spans (AWS SQS v3 suppressed: ${stringifyItems(spans)}`);
          }
        });
      });
    });

    describe('tracing enabled but suppressed', () => {
      let senderControls;

      before(async () => {
        senderControls = new ProcessControls({
          dirname: __dirname,
          appName: 'sender.js',
          useGlobalAgent: true,
          env: {
            ...libraryEnv,
            AWS_SQS_QUEUE_URL: `${queueUrlPrefix}${queueName}`
          }
        });

        await senderControls.startAndWaitForAgentConnection();
      });

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });

      after(async () => {
        await senderControls.stop();
      });

      afterEach(async () => {
        await senderControls.clearIpcMessages();
      });

      const receivingMethod = getNextReceiveMethod();
      describe('tracing suppressed', () => {
        let receiverControls;

        before(async () => {
          receiverControls = new ProcessControls({
            dirname: __dirname,
            appName: 'receiver.js',
            useGlobalAgent: true,
            env: {
              ...libraryEnv,
              SQSV3_RECEIVE_METHOD: receivingMethod,
              AWS_SQS_QUEUE_URL: `${queueUrlPrefix}${queueName}`
            }
          });

          await receiverControls.startAndWaitForAgentConnection();
        });

        beforeEach(async () => {
          await agentControls.clearReceivedTraceData();
        });

        after(async () => {
          await receiverControls.stop();
        });

        afterEach(async () => {
          await receiverControls.clearIpcMessages();
        });

        const sendingMethod = getNextSendMethod();
        it(`doesn't trace when sending(${sendingMethod}) and receiving(${receivingMethod})`, async () => {
          const response = await senderControls.sendRequest({
            method: 'GET',
            path: `/send-message/${sendingMethod}`,
            headers: {
              'X-INSTANA-L': '0'
            }
          });

          await retry(() => {
            verifyResponseAndMessage(response, receiverControls);
          }, 1000);

          await delay(1000);
          const spans = await agentControls.getSpans();
          if (spans.length > 0) {
            fail(`Unexpected spans (AWS SQS v3 suppressed: ${stringifyItems(spans)}`);
          }

          await verifyNoUnclosedSpansHaveBeenDetected(receiverControls);
        });
      });
    });

    describe('tracing enabled with wrong queue name', () => {
      let receiverControls;

      before(async () => {
        receiverControls = new ProcessControls({
          dirname: __dirname,
          appName: 'receiver.js',
          useGlobalAgent: true,
          env: {
            ...libraryEnv,
            SQSV3_RECEIVE_METHOD: 'v3',
            AWS_SQS_QUEUE_URL: `${queueURL}-non-existent`
          }
        });

        await receiverControls.startAndWaitForAgentConnection();
      });

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });

      after(async () => {
        await receiverControls.stop();
      });

      afterEach(async () => {
        await receiverControls.clearIpcMessages();
      });

      it('reports an error span', async () => {
        await retry(async () => {
          await delay(250);
          const spans = await agentControls.getSpans();

          // eslint-disable-next-line no-console
          spans.forEach(s => console.log(s.data));

          expectAtLeastOneMatching(spans, [
            span => expect(span.ec).equal(1),
            span => expect(span.data.sqs.error).to.contain('specified queue does not exist')
          ]);
        });

        await verifyNoUnclosedSpansHaveBeenDetected(receiverControls);
      });
    });

    describe('message header limits', function () {
      let senderControls;
      let receiverControls;

      before(async () => {
        senderControls = new ProcessControls({
          dirname: __dirname,
          appName: 'sender.js',
          useGlobalAgent: true,
          env: {
            ...libraryEnv,
            AWS_SQS_QUEUE_URL: `${queueUrlPrefix}${queueName}`
          }
        });
        receiverControls = new ProcessControls({
          dirname: __dirname,
          appName: 'receiver.js',
          useGlobalAgent: true,
          env: {
            ...libraryEnv,
            AWS_SQS_QUEUE_URL: `${queueUrlPrefix}${queueName}`
          }
        });

        await senderControls.startAndWaitForAgentConnection();
        await receiverControls.startAndWaitForAgentConnection();
      });

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });

      after(async () => {
        await receiverControls.stop();
        await senderControls.stop();
      });

      afterEach(async () => {
        await receiverControls.clearIpcMessages();
        await senderControls.clearIpcMessages();
      });

      const sendingMethod = getNextSendMethod();
      const apiPath = `/send-message/${sendingMethod}`;

      it('creates spans but does not add correlation headers', async () => {
        const response = await senderControls.sendRequest({
          method: 'GET',
          path: `${apiPath}?addHeaders=9`
        });

        await retry(async () => {
          verifyResponseAndMessage(response, receiverControls);
          const spans = await agentControls.getSpans();

          const httpEntry = verifyHttpRootEntry({ spans, apiPath, pid: String(senderControls.getPid()) });
          verifySQSExit({ senderControls, spans, parent: httpEntry });
          verifyHttpExit({ spans, parent: httpEntry, pid: String(senderControls.getPid()) });

          // The SQS entry will be the root of a new trace because we were not able to add tracing headers.
          const sqsEntry = verifySQSEntry({ receiverControls, spans, parent: null });
          verifyHttpExit({ spans, parent: sqsEntry, pid: String(receiverControls.getPid()) });
        }, 1000);

        await verifyNoUnclosedSpansHaveBeenDetected(receiverControls);
      });
    });

    async function verify({ receiverControls, senderControls, response, apiPath, withError, isBatch, isSQSConsumer }) {
      if (withError === 'sender') {
        expect(response.error).to.equal('MissingParameter: The request must contain the parameter MessageBody.');
      } else {
        await retry(async () => {
          if (isBatch) {
            verifyResponseAndBatchMessage(response, receiverControls, isSQSConsumer);
          } else {
            verifyResponseAndMessage(response, receiverControls);
          }
          const spans = await agentControls.getSpans();
          verifySpans({ receiverControls, senderControls, spans, apiPath, withError, isBatch, isSQSConsumer });
        }, 1000);
      }
    }

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
    }

    async function verifySingleSqsEntrySpanWithParent(traceId, spanId) {
      await retry(async () => {
        const spans = await agentControls.getSpans();
        return expectExactlyOneMatching(spans, [
          span => expect(span.t).to.equal(traceId),
          span => expect(span.p).to.equal(spanId),
          span => expect(span.k).to.equal(constants.ENTRY)
        ]);
      }, 1000);
    }

    function verifySpans({ receiverControls, senderControls, spans, apiPath, withError, isBatch, isSQSConsumer }) {
      const httpEntry = verifyHttpRootEntry({ spans, apiPath, pid: String(senderControls.getPid()) });
      const sqsExit = verifySQSExit({ senderControls, spans, parent: httpEntry, withError });
      verifyHttpExit({ spans, parent: httpEntry, pid: String(senderControls.getPid()) });

      if (withError !== 'publisher') {
        const sqsEntry = verifySQSEntry({ receiverControls, spans, parent: sqsExit, withError, isBatch });

        if (isSQSConsumer) {
          // filter out entry spans in case of multiple entry spans created,
          // while we receive sqs batch messages in multiple batches
          const sqsEntrySpans = spans.filter(span => span.k === 1 && span.n === 'sqs');
          sqsEntrySpans.forEach(sqsEntrySpan => {
            const n = sqsEntrySpan.data.sqs.size;
            verifyHttpExit({
              spans,
              parent: sqsEntrySpan,
              pid: String(receiverControls.getPid()),
              testMethod: (exitSpans, tests) => {
                return expectExactlyNMatching(exitSpans, n, tests);
              }
            });
          });
        } else {
          verifyHttpExit({
            spans,
            parent: sqsEntry,
            pid: String(receiverControls.getPid())
          });
        }
      }
    }

    function verifySQSEntry({ receiverControls, spans, parent, withError, isBatch }) {
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

    function verifySQSExit({ senderControls, spans, parent, withError }) {
      return expectExactlyOneMatching(spans, [
        span => expect(span.n).to.equal('sqs'),
        span => expect(span.k).to.equal(constants.EXIT),
        span => expect(span.t).to.equal(parent.t),
        span => expect(span.p).to.equal(parent.s),
        span => expect(span.f.e).to.equal(String(senderControls.getPid())),
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

    /**
     * Verify that the warning "Cannot start an AWS SQS entry span when another span is already active."
     * has not been logged. That log message would indicate that we did not correctly cancel the SQS entry span that had
     * been started for the previous sqs.receiveMessage/sqs.sendCommand invocation.
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
  });
}

module.exports = function (name, version, isLatest) {
  libraryEnv = { LIBRARY_VERSION: version, LIBRARY_NAME: name, LIBRARY_LATEST: isLatest };
  return start.call(this);
};
