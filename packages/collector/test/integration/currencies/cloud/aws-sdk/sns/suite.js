/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const { v4: uuid } = require('uuid');
const { cleanup, createTopic } = require('./util');
const semver = require('semver');
const { expect } = require('chai');
const { fail } = expect;
const constants = require('@_local/core').tracing.constants;
const supportedVersion = require('@_local/core').tracing.supportedVersion;
const config = require('@_local/core/test/config');
const { retry, stringifyItems, delay, expectExactlyOneMatching } = require('@_local/core/test/test_util');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const globalAgent = require('@_local/collector/test/globalAgent');
const {
  verifyHttpRootEntry,
  verifyExitSpan,
  verifyHttpExit
} = require('@_local/core/test/test_util/common_verifications');
const { promisifyNonSequentialCases } = require('../promisify_non_sequential');

const topicAndQueueName = `nodejs-team-${semver.major(process.versions.node)}-${uuid()}`;
const topicArn = `arn:aws:sns:us-east-2:767398002385:${topicAndQueueName}`;
const sqsQueueUrl = `https://sqs.us-east-2.amazonaws.com/767398002385/${topicAndQueueName}`;

const withErrorOptions = [false, true];
const requestMethods = ['Callback', 'Promise', 'Async'];
const availableOperations = ['publish'];
const getNextCallMethod = require('@_local/core/test/test_util/circular_list').getCircularList(requestMethods);

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

module.exports = function (libraryEnv) {
  mochaSuiteFn('tracing/cloud/aws-sdk/v2/sns', function () {
    this.timeout(config.getTestTimeout() * 3);

    globalAgent.setUpCleanUpHooks();
    const agentControls = globalAgent.instance;

    before(async () => {
      await createTopic(topicAndQueueName);
    });

    after(async () => {
      await cleanup(topicArn, sqsQueueUrl);
    });

    describe('tracing enabled, no suppression', function () {
      let senderControls;
      let receiverControls;

      before(async () => {
        senderControls = new ProcessControls({
          dirname: __dirname,
          useGlobalAgent: true,
          env: {
            AWS_SNS_TOPIC_ARN: topicArn,
            ...libraryEnv
          }
        });
        receiverControls = new ProcessControls({
          dirname: __dirname,
          appName: '../sqs/receiveMessage.js',
          useGlobalAgent: true,
          env: {
            SQS_RECEIVE_METHOD: 'callback',
            AWS_SQS_QUEUE_URL: sqsQueueUrl,
            ...libraryEnv
          }
        });

        await senderControls.startAndWaitForAgentConnection();
        await receiverControls.startAndWaitForAgentConnection();
      });

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });

      after(async () => {
        await senderControls.stop();
        await receiverControls.stop();
      });

      afterEach(async () => {
        await senderControls.clearIpcMessages();
        await receiverControls.clearIpcMessages();
      });

      withErrorOptions.forEach(withError => {
        if (withError) {
          describe('getting result with error', () => {
            it(`should instrument ${availableOperations.join(', ')} with error`, () =>
              promisifyNonSequentialCases(verify, availableOperations, senderControls, withError, getNextCallMethod));
          });
        } else {
          describe('getting result without error', () => {
            availableOperations.forEach(operation => {
              const requestMethod = getNextCallMethod();
              it(`operation: ${operation}/${requestMethod}`, async () => {
                const withErrorOption = withError ? '?withError=1' : '';
                const apiPath = `/${operation}/${requestMethod}`;
                const response = await senderControls.sendRequest({
                  method: 'GET',
                  path: `${apiPath}${withErrorOption}`,
                  simple: withError === false
                });
                return verify(senderControls, response, apiPath, operation, withError, receiverControls);
              });
            });
          });
        }
      });

      describe('message header limits', () => {
        it('creates spans but does not add correlation headers ', async () => {
          const operation = 'publish';
          const apiPath = `/${operation}/Async`;
          await senderControls.sendRequest({
            method: 'GET',
            path: `${apiPath}?addHeaders=9`
          });
          await retry(async () => {
            const spans = await agentControls.getSpans();
            const httpEntry = verifyHttpRootEntry({ spans, apiPath, pid: String(senderControls.getPid()) });
            verifyExitSpan({
              spanName: 'sns',
              spans,
              parent: httpEntry,
              withError: false,
              pid: String(senderControls.getPid()),
              extraTests: [span => expect(span.data.sns.topic).to.equal(topicArn)]
            });

            verifyHttpExit({ spans, parent: httpEntry, pid: String(senderControls.getPid()) });
            verifySQSEntrySpan(spans, String(receiverControls.getPid()), null);
          });
        });
      });

      async function verify(_senderControls, response, apiPath, operation, withError, _receiverControls) {
        const spans = await retry(async () => {
          const _spans = await agentControls.getSpans();
          const sqsEntrySpan = _spans.filter(span => span.n === 'sqs' && span.k === constants.ENTRY);

          if (withError || (sqsEntrySpan.length > 0 && !withError)) {
            return _spans;
          } else {
            throw new Error(`Expected an SQS entry span but did not receive one. All spans: ${stringifyItems(_spans)}`);
          }
        }, 1000);

        verifySpans(_senderControls, spans, apiPath, operation, withError, _receiverControls);
      }

      function verifySpans(_senderControls, spans, apiPath, operation, withError, _receiverControls) {
        const httpEntry = verifyHttpRootEntry({ spans, apiPath, pid: String(_senderControls.getPid()) });
        const exitpSpan = verifyExitSpan({
          spanName: 'sns',
          spans,
          parent: httpEntry,
          withError,
          pid: String(_senderControls.getPid()),
          extraTests: [span => expect(span.data.sns.topic).to.equal(topicArn)]
        });

        if (!withError) {
          verifyHttpExit({ spans, parent: httpEntry, pid: String(_senderControls.getPid()) });
          verifySQSEntrySpan(spans, String(_receiverControls.getPid()), exitpSpan);
        }
      }

      function verifySQSEntrySpan(spans, receiverPid, parent) {
        expectExactlyOneMatching(spans, [
          span => expect(span.n).to.be.eq('sqs'),
          span => expect(span.k).to.be.eq(constants.ENTRY),
          span => expect(span.f.e).to.be.eq(receiverPid),
          span => (parent ? expect(span.t).to.be.eq(parent.t) : expect(span.t).to.be.a('string')),
          span => (parent ? expect(span.p).to.be.eq(parent.s) : expect(span.p).to.not.exist),
          span => expect(span.data.sqs.queue).to.be.eq(sqsQueueUrl)
        ]);
      }
    });

    describe('tracing disabled', () => {
      this.timeout(config.getTestTimeout() * 2);

      let appControls;

      before(async () => {
        appControls = new ProcessControls({
          dirname: __dirname,
          appName: 'app.js',
          useGlobalAgent: true,
          tracingEnabled: false,
          env: {
            AWS_SNS_TOPIC_ARN: topicArn,
            ...libraryEnv
          }
        });

        await appControls.startAndWaitForAgentConnection();
      });

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });

      after(async () => {
        await appControls.stop();
      });

      afterEach(async () => {
        await appControls.clearIpcMessages();
      });

      describe('attempt to get result', () => {
        availableOperations.forEach(operation => {
          const requestMethod = getNextCallMethod();
          it(`should not trace (${operation}/${requestMethod})`, async () => {
            await appControls.sendRequest({
              method: 'GET',
              path: `/${operation}/${requestMethod}`
            });

            await delay(1000);
            const spans = await agentControls.getSpans();
            if (spans.length > 0) {
              fail(`Unexpected spans: ${stringifyItems(spans)}`);
            }
          });
        });
      });
    });

    describe('tracing enabled but suppressed', () => {
      let appControls;

      before(async () => {
        appControls = new ProcessControls({
          dirname: __dirname,
          appName: 'app.js',
          useGlobalAgent: true,
          env: {
            AWS_SNS_TOPIC_ARN: topicArn,
            ...libraryEnv
          }
        });

        await appControls.startAndWaitForAgentConnection();
      });

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });

      after(async () => {
        await appControls.stop();
      });

      afterEach(async () => {
        await appControls.clearIpcMessages();
      });

      describe('attempt to get result', () => {
        availableOperations.forEach(operation => {
          const requestMethod = getNextCallMethod();
          it(`should not trace (${operation}/${requestMethod})`, async () => {
            await appControls.sendRequest({
              suppressTracing: true,
              method: 'GET',
              path: `/${operation}/${requestMethod}`
            });

            await delay(1000);
            const spans = await agentControls.getSpans();
            if (spans.length > 0) {
              fail(`Unexpected spans: ${stringifyItems(spans)}`);
            }
          });
        });
      });
    });
  });
};
