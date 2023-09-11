/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const semver = require('semver');
const { expect } = require('chai');
const { fail } = expect;
const qs = require('querystring');
const path = require('path');
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../../../core/test/config');
const { retry, delay, stringifyItems, expectExactlyOneMatching } = require('../../../../../../../core/test/test_util');
const ProcessControls = require('../../../../../test_util/ProcessControls');
const globalAgent = require('../../../../../globalAgent');
const {
  verifyHttpRootEntry,
  verifyExitSpan,
  verifyHttpExit
} = require('@instana/core/test/test_util/common_verifications');
const constants = require('@instana/core').tracing.constants;
const utils = require('./utils');

let topicArn;
const topicName = 'MyNodeTopicArn';
const availableStyles = ['default', 'callback', 'v2'];
const availableCommands = {
  PublishCommand: {
    Message: 'STRING_VALUE',
    TargetArn: 'STRING_VALUE',
    Subject: 'STRING_VALUE'
  }
};

function start(version) {
  let mochaSuiteFn;
  this.timeout(config.getTestTimeout() * 4);

  // https://github.com/aws/aws-sdk-js-v3/blob/v3.391.0/clients/client-sns/package.json#L70
  if (!supportedVersion(process.versions.node) || semver.lt(process.versions.node, '14.0.0')) {
    mochaSuiteFn = describe.skip;
  } else {
    mochaSuiteFn = describe;
  }

  const queueName = utils.generateQueueName();
  const retryTime = config.getTestTimeout() * 5;
  let queueUrl;
  let receiverControls;
  let appControls;

  before(async () => {
    const queue = await utils.createQueue(queueName);
    const topic = await utils.createTopic(topicName);

    topicArn = topic.TopicArn;
    queueUrl = queue.QueueUrl;

    await utils.subscribe(topicArn, queueUrl);
  });

  after(async () => {
    await utils.removeQueue(queueUrl);
  });

  mochaSuiteFn(`npm: ${version}`, function () {
    globalAgent.setUpCleanUpHooks();
    const agentControls = globalAgent.instance;

    describe('tracing enabled, no suppression', function () {
      before(async () => {
        receiverControls = new ProcessControls({
          appPath: path.join(__dirname, '../sqs/receiver'),
          useGlobalAgent: true,
          env: {
            AWS_ENDPOINT: process.env.LOCALSTACK_AWS,
            AWS_SQS_QUEUE_URL: queueUrl,
            SQS_POLL_DELAY: 5
          }
        });

        appControls = new ProcessControls({
          appPath: path.join(__dirname, 'app'),
          useGlobalAgent: true,
          env: {}
        });

        await receiverControls.startAndWaitForAgentConnection();
        await appControls.startAndWaitForAgentConnection();
      });

      after(async () => {
        await receiverControls.stop();
        await appControls.stop();
      });

      availableStyles.forEach(style => {
        const key = 'PublishCommand';

        it(`should trace operation: ${key}, style: ${style}`, async () => {
          const url = '/execute/';

          const opts = availableCommands[key];
          opts.TopicArn = topicArn;

          await appControls.sendRequest({
            method: 'GET',
            path: `${url}?style=${style}&command=${key}&${qs.stringify(opts)}`
          });

          return verify(appControls, url);
        });

        it(`should trace operation: ${key}, style: ${style} with message attributes`, async () => {
          const url = '/execute/';

          const opts = availableCommands[key];
          opts.TopicArn = topicArn;

          await appControls.sendRequest({
            method: 'GET',
            path: `${url}?msgattrs=3&style=${style}&command=${key}&${qs.stringify(opts)}`
          });

          return verify(appControls, url);
        });

        it(`should trace operation: ${key}, style: ${style} but too many message attributes`, async () => {
          const url = '/execute/';

          const opts = availableCommands[key];
          opts.TopicArn = topicArn;

          await appControls.sendRequest({
            method: 'GET',
            path: `${url}?msgattrs=15&style=${style}&command=${key}&${qs.stringify(opts)}`
          });

          return verify(appControls, url, false);
        });
      });
    });

    describe('tracing enabled, but suppressed', function () {
      before(async () => {
        receiverControls = new ProcessControls({
          appPath: path.join(__dirname, '../sqs/receiver'),
          useGlobalAgent: true,
          env: {
            AWS_ENDPOINT: process.env.LOCALSTACK_AWS,
            AWS_SQS_QUEUE_URL: queueUrl,
            SQS_POLL_DELAY: 5
          }
        });

        appControls = new ProcessControls({
          appPath: path.join(__dirname, 'app'),
          useGlobalAgent: true,
          env: {}
        });

        await receiverControls.startAndWaitForAgentConnection();
        await appControls.startAndWaitForAgentConnection();
      });

      after(async () => {
        await receiverControls.stop();
        await appControls.stop();
      });

      availableStyles.forEach(style => {
        const key = 'PublishCommand';

        it(`should not trace operation: ${key}, style: ${style}`, async () => {
          const url = '/execute/';

          const opts = availableCommands[key];
          opts.TopicArn = topicArn;

          await appControls.sendRequest({
            method: 'GET',
            path: `${url}?style=${style}&command=${key}&${qs.stringify(opts)}`,
            suppressTracing: true
          });

          return retry(() => delay(config.getTestTimeout() / 4), retryTime)
            .then(() => agentControls.getSpans())
            .then(spans => {
              if (spans.length > 0) {
                fail(`Unexpected spans (AWS SNS suppressed: ${stringifyItems(spans)}`);
              }
            });
        });
      });
    });

    describe('tracing disabled', function () {
      before(async () => {
        receiverControls = new ProcessControls({
          appPath: path.join(__dirname, '../sqs/receiver'),
          useGlobalAgent: true,
          tracingEnabled: false,
          env: {
            AWS_ENDPOINT: process.env.LOCALSTACK_AWS,
            AWS_SQS_QUEUE_URL: queueUrl,
            SQS_POLL_DELAY: 5
          }
        });

        appControls = new ProcessControls({
          appPath: path.join(__dirname, 'app'),
          useGlobalAgent: true,
          env: {}
        });

        await receiverControls.startAndWaitForAgentConnection();
        await appControls.startAndWaitForAgentConnection();
      });

      after(async () => {
        await receiverControls.stop();
        await appControls.stop();
      });

      availableStyles.forEach(style => {
        const key = 'PublishCommand';

        it(`should not trace operation: ${key}, style: ${style}`, async () => {
          const url = '/execute/';

          const opts = availableCommands[key];
          opts.TopicArn = topicArn;

          await appControls.sendRequest({
            method: 'GET',
            path: `${url}?style=${style}&command=${key}&${qs.stringify(opts)}`,
            suppressTracing: true
          });

          return retry(() => delay(config.getTestTimeout() / 4), retryTime)
            .then(() => agentControls.getSpans())
            .then(spans => {
              if (spans.length > 0) {
                fail(`Unexpected spans (AWS SNS suppressed: ${stringifyItems(spans)}`);
              }
            });
        });
      });
    });

    function verify(controls, apiPath, withSqsParent = true) {
      return retry(
        () => agentControls.getSpans().then(spans => verifySpans(controls, spans, apiPath, withSqsParent)),
        retryTime
      );
    }

    function verifySpans(controls, spans, apiPath, withSqsParent) {
      const httpEntry = verifyHttpRootEntry({ spans, apiPath, pid: String(controls.getPid()) });

      const exitSpan = verifyExitSpan({
        spanName: 'sns',
        spans,
        parent: httpEntry,
        withError: false,
        pid: String(controls.getPid()),
        extraTests: [
          span => expect(typeof span.data.sns.topic).to.exist,
          span => expect(typeof span.data.sns.subject).to.exist,
          span => expect(typeof span.data.sns.target).to.exist
        ]
      });

      verifyHttpExit({ spans, parent: httpEntry, pid: String(controls.getPid()) });
      verifySQSEntrySpan(spans, String(receiverControls.getPid()), withSqsParent ? exitSpan : null);
    }

    function verifySQSEntrySpan(spans, receiverPid, parent) {
      expectExactlyOneMatching(spans, [
        span => expect(span.n).to.be.eq('sqs'),
        span => expect(span.k).to.be.eq(constants.ENTRY),
        span => expect(span.f.e).to.be.eq(receiverPid),
        span => (parent ? expect(span.t).to.be.eq(parent.t) : expect(span.t).to.be.a('string')),
        span => (parent ? expect(span.p).to.be.eq(parent.s) : expect(span.p).to.not.exist),
        span => expect(span.data.sqs.queue).to.be.eq(queueUrl)
      ]);
    }
  });
}
module.exports = function (version) {
  return start.bind(this)(version);
};
