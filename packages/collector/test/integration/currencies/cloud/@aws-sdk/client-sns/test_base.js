/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const { expect } = require('chai');
const { fail } = expect;
const qs = require('querystring');
const path = require('path');
const supportedVersion = require('@_local/core').tracing.supportedVersion;
const config = require('@_local/core/test/config');
const { retry, delay, stringifyItems, expectExactlyOneMatching } = require('@_local/core/test/test_util');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const globalAgent = require('@_local/collector/test/globalAgent');
const {
  verifyHttpRootEntry,
  verifyExitSpan,
  verifyHttpExit
} = require('@_local/core/test/test_util/common_verifications');
const constants = require('@_local/core').tracing.constants;
let utils;

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

let libraryEnv;

function start() {
  this.timeout(config.getTestTimeout() * 4);

  if (!supportedVersion(process.versions.node)) {
    it.skip(`npm: ${libraryEnv.LIBRARY_VERSION}`, () => {});
    return;
  }

  utils = require('./utils');
  const queueName = utils.generateQueueName();

  let queueUrl;
  let receiverControls;
  let appControls;

  before(async () => {
    // TODO: move into the app.js file
    const queue = await utils.createQueue(queueName);
    const topic = await utils.createTopic(topicName);

    topicArn = topic.TopicArn;
    queueUrl = queue.QueueUrl;

    await utils.subscribe(topicArn, queueUrl);
  });

  after(async () => {
    // CASE: queue was not created in before hook
    if (!queueUrl) {
      return;
    }

    await utils.removeQueue(queueUrl);
  });

  describe(`npm: ${libraryEnv.LIBRARY_VERSION}`, function () {
    globalAgent.setUpCleanUpHooks();
    const agentControls = globalAgent.instance;

    describe('tracing enabled, no suppression', function () {
      before(async () => {
        receiverControls = new ProcessControls({
          dirname: path.join(__dirname, '../client-sqs'),
          appName: 'receiver.js',
          useGlobalAgent: true,
          env: {
            AWS_ENDPOINT: process.env.INSTANA_CONNECT_LOCALSTACK_AWS,
            AWS_SQS_QUEUE_URL: queueUrl,
            SQS_POLL_DELAY: 5
          }
        });

        appControls = new ProcessControls({
          dirname: __dirname,
          appName: 'app.js',
          useGlobalAgent: true,
          env: {
            ...libraryEnv
          }
        });

        await receiverControls.startAndWaitForAgentConnection();
        await appControls.startAndWaitForAgentConnection(5000, Date.now() + 10000);
      });

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });

      afterEach(async () => {
        await receiverControls.clearIpcMessages();
        await appControls.clearIpcMessages();
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
          dirname: path.join(__dirname, '../client-sqs'),
          appName: 'receiver.js',
          useGlobalAgent: true,
          env: {
            AWS_ENDPOINT: process.env.INSTANA_CONNECT_LOCALSTACK_AWS,
            AWS_SQS_QUEUE_URL: queueUrl,
            SQS_POLL_DELAY: 5
          }
        });

        appControls = new ProcessControls({
          dirname: __dirname,
          appName: 'app.js',
          useGlobalAgent: true,
          env: {
            ...libraryEnv
          }
        });

        await receiverControls.startAndWaitForAgentConnection();
        await appControls.startAndWaitForAgentConnection();
      });

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });

      after(async () => {
        await receiverControls.stop();
        await appControls.stop();
      });

      afterEach(async () => {
        await receiverControls.clearIpcMessages();
        await appControls.clearIpcMessages();
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

          await delay(1000);
          const spans = await agentControls.getSpans();
          if (spans.length > 0) {
            fail(`Unexpected spans: ${stringifyItems(spans)}`);
          }
        });
      });
    });

    describe('tracing disabled', function () {
      before(async () => {
        receiverControls = new ProcessControls({
          dirname: path.join(__dirname, '../client-sqs'),
          appName: 'receiver.js',
          useGlobalAgent: true,
          tracingEnabled: false,
          env: {
            AWS_ENDPOINT: process.env.INSTANA_CONNECT_LOCALSTACK_AWS,
            AWS_SQS_QUEUE_URL: queueUrl,
            SQS_POLL_DELAY: 5
          }
        });

        appControls = new ProcessControls({
          dirname: __dirname,
          appName: 'app.js',
          useGlobalAgent: true,
          env: {
            ...libraryEnv
          }
        });

        await receiverControls.startAndWaitForAgentConnection();
        await appControls.startAndWaitForAgentConnection();
      });

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });

      after(async () => {
        await receiverControls.stop();
        await appControls.stop();
      });

      afterEach(async () => {
        await receiverControls.clearIpcMessages();
        await appControls.clearIpcMessages();
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

          await delay(1000);
          const spans = await agentControls.getSpans();
          if (spans.length > 0) {
            fail(`Unexpected spans: ${stringifyItems(spans)}`);
          }
        });
      });
    });

    function verify(controls, apiPath, withSqsParent = true) {
      return retry(
        () => agentControls.getSpans().then(spans => verifySpans(controls, spans, apiPath, withSqsParent)),
        1000
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
module.exports = function (name, version, isLatest) {
  libraryEnv = { LIBRARY_VERSION: version, LIBRARY_NAME: name, LIBRARY_LATEST: isLatest };
  return start.call(this);
};
