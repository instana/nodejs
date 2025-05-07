/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const path = require('path');
const { expect } = require('chai');
const { fail } = expect;
const semver = require('semver');

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../../core/test/config');
const { delay, expectExactlyOneMatching, retry, stringifyItems } = require('../../../../../../core/test/test_util');
const ProcessControls = require('../../../../test_util/ProcessControls');
const globalAgent = require('../../../../globalAgent');
// We use different topics/subscriptions per Node.js major version so tests on CI run independently of each other.
const defaultTopicName = `nodejs-test-topic-${semver.parse(process.version).major}`;
const defaultSubscriptionName = `nodejs-test-subscription-${semver.parse(process.version).major}`;

/**
 * This suite is skipped if no GCP project ID has been provided via GPC_PROJECT. It also requires to either have GCP
 * default credentials to be configured, for example via GOOGLE_APPLICATION_CREDENTIALS, or (for CI) to get
 *  the credentials as a string from GOOGLE_APPLICATION_CREDENTIALS_CONTENT.
 *
 * https://console.cloud.google.com/home/dashboard?project=k8s-brewery&pli=1
 *
 * You can find the credentials in 1pwd.
 */

if (
  !process.env.GCP_PROJECT ||
  !(process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_APPLICATION_CREDENTIALS_CONTENT)
) {
  describe('tracing/cloud/gcp/pubsub', function () {
    it('configuration for Google Cloud Platform is missing', () => {
      fail(
        'Please set GCP_PROJECT and GOOGLE_APPLICATION_CREDENTIALS (or GOOGLE_APPLICATION_CREDENTIALS_CONTENT)' +
          ' to enable GCP tests.'
      );
    });
  });
} else {
  let mochaSuiteFn;
  const projectId = process.env.GCP_PROJECT;

  // Note: Skipping test for node v24 as the library is broken
  //       see Issue: https://github.com/googleapis/google-auth-library-nodejs/issues/1964
  if ((!supportedVersion(process.versions.node) && semver.satisfies(process.versions.node, '>=24.x')) || !projectId) {
    mochaSuiteFn = describe.skip;
  } else {
    mochaSuiteFn = describe;
  }

  const retryTime = 1000;

  mochaSuiteFn('tracing/cloud/gcp/pubsub', function () {
    this.timeout(config.getTestTimeout() * 3);

    globalAgent.setUpCleanUpHooks();
    const agentControls = globalAgent.instance;

    describe('tracing enabled, no suppression', function () {
      const topicName = defaultTopicName;
      const subscriptionName = defaultSubscriptionName;

      let publisherControls;
      let subscriberControls;

      before(async () => {
        publisherControls = new ProcessControls({
          appPath: path.join(__dirname, 'publisher'),
          useGlobalAgent: true,
          env: {
            GCP_PROJECT: projectId,
            GCP_PUBSUB_TOPIC: topicName,
            GCP_PUBSUB_SUBSCRIPTION: subscriptionName
          }
        });
        subscriberControls = new ProcessControls({
          appPath: path.join(__dirname, 'subscriber'),
          useGlobalAgent: true,
          env: {
            GCP_PROJECT: projectId,
            GCP_PUBSUB_TOPIC: topicName,
            GCP_PUBSUB_SUBSCRIPTION: subscriptionName
          }
        });

        await publisherControls.startAndWaitForAgentConnection();
        await subscriberControls.startAndWaitForAgentConnection();
      });

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });

      after(async () => {
        await publisherControls.stop();
        await subscriberControls.stop();
      });

      afterEach(async () => {
        await publisherControls.clearIpcMessages();
        await subscriberControls.clearIpcMessages();
      });

      ['promise', 'callback'].forEach(apiVariant => {
        [false, 'publisher'].forEach(withError => {
          const mochaTestFn = apiVariant === 'callback' && withError === 'publisher' ? it.skip : it;

          // It's not clear how to trigger a non-sync error in the publisher, so we skip that combination.
          mochaTestFn(
            `must trace google cloud pubsub publish and subscribe (${apiVariant}, error: ${withError})`,
            () => {
              const apiPath = `/publish-${apiVariant}`;
              const queryParams = [withError ? `withError=${withError}` : null].filter(param => !!param).join('&');
              const apiPathWithQuery = queryParams ? `${apiPath}?${queryParams}` : `${apiPath}`;

              return publisherControls
                .sendRequest({
                  method: 'POST',
                  path: apiPathWithQuery,
                  simple: withError !== 'publisher'
                })
                .then(response => verify(response, apiPath, withError));
            }
          );
        });
      });

      function verify(response, apiPath, withError) {
        if (withError === 'publisher') {
          expect(response).to.contain('Data must be in the form of a Buffer');
          return retry(
            () => agentControls.getSpans().then(spans => verifySpans(spans, apiPath, null, withError)),
            retryTime
          );
        } else {
          return retry(() => {
            const messageId = verifyResponseAndMessage(response, subscriberControls);
            return agentControls.getSpans().then(spans => verifySpans(spans, apiPath, messageId, withError));
          }, retryTime);
        }
      }

      function verifySpans(spans, apiPath, messageId, withError) {
        const httpEntry = verifyHttpEntry(spans, apiPath);
        const gcpsExit = verifyGoogleCloudPubSubExit(spans, httpEntry, messageId, withError);
        if (withError !== 'publisher') {
          verifyGoogleCloudPubSubEntry(spans, gcpsExit, messageId, withError);
        }
      }

      function verifyHttpEntry(spans, apiPath) {
        return expectExactlyOneMatching(spans, [
          span => expect(span.p).to.not.exist,
          span => expect(span.k).to.equal(constants.ENTRY),
          span => expect(span.f.e).to.equal(String(publisherControls.getPid())),
          span => expect(span.f.h).to.equal('agent-stub-uuid'),
          span => expect(span.n).to.equal('node.http.server'),
          span => expect(span.data.http.url).to.equal(apiPath)
        ]);
      }

      function verifyGoogleCloudPubSubExit(spans, parent, messageId, withError) {
        return expectExactlyOneMatching(spans, span => {
          expect(span.n).to.equal('gcps');
          expect(span.k).to.equal(constants.EXIT);
          expect(span.t).to.equal(parent.t);
          expect(span.p).to.equal(parent.s);
          expect(span.f.e).to.equal(String(publisherControls.getPid()));
          expect(span.f.h).to.equal('agent-stub-uuid');
          expect(span.error).to.not.exist;
          if (withError) {
            expect(span.ec).to.equal(1);
          } else {
            expect(span.ec).to.equal(0);
          }
          expect(span.async).to.not.exist;
          expect(span.data).to.exist;
          expect(span.data.gcps).to.be.an('object');
          expect(span.data.gcps.op).to.equal('publish');
          expect(span.data.gcps.projid).to.equal(projectId);
          expect(span.data.gcps.top).to.equal(topicName);
          if (withError === 'publisher') {
            expect(span.data.gcps.error).to.contain('Data must be in the form of a Buffer');
          } else {
            expect(span.data.gcps.messageId).to.equal(messageId);
          }
        });
      }

      function verifyGoogleCloudPubSubEntry(spans, parent, messageId, withError) {
        return expectExactlyOneMatching(spans, span => {
          expect(span.n).to.equal('gcps');
          expect(span.k).to.equal(constants.ENTRY);
          expect(span.t).to.equal(parent.t);
          expect(span.p).to.equal(parent.s);
          expect(span.f.e).to.equal(String(subscriberControls.getPid()));
          expect(span.f.h).to.equal('agent-stub-uuid');
          expect(span.error).to.not.exist;
          if (withError) {
            expect(span.ec).to.equal(1);
          } else {
            expect(span.ec).to.equal(0);
          }
          expect(span.async).to.not.exist;
          expect(span.data).to.exist;
          expect(span.data.gcps).to.be.an('object');
          expect(span.data.gcps.op).to.equal('consume');
          expect(span.data.gcps.projid).to.equal(projectId);
          expect(span.data.gcps.sub).to.equal(subscriptionName);
          expect(span.data.gcps.messageId).to.equal(messageId);
        });
      }
    });

    describe('tracing enabled but suppressed', () => {
      const topicName = `${defaultTopicName}-suppression`;
      const subscriptionName = `${defaultSubscriptionName}-suppression`;

      let publisherControls;
      let subscriberControls;

      before(async () => {
        publisherControls = new ProcessControls({
          appPath: path.join(__dirname, 'publisher'),
          useGlobalAgent: true,
          env: {
            GCP_PROJECT: projectId,
            GCP_PUBSUB_TOPIC: topicName,
            GCP_PUBSUB_SUBSCRIPTION: subscriptionName
          }
        });
        subscriberControls = new ProcessControls({
          appPath: path.join(__dirname, 'subscriber'),
          useGlobalAgent: true,
          env: {
            GCP_PROJECT: projectId,
            GCP_PUBSUB_TOPIC: topicName,
            GCP_PUBSUB_SUBSCRIPTION: subscriptionName
          }
        });

        await publisherControls.startAndWaitForAgentConnection();
        await subscriberControls.startAndWaitForAgentConnection();
      });

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });

      after(async () => {
        await publisherControls.stop();
        await subscriberControls.stop();
      });

      afterEach(async () => {
        await publisherControls.clearIpcMessages();
        await subscriberControls.clearIpcMessages();
      });

      it('should not trace when suppressed', () =>
        publisherControls
          .sendRequest({
            method: 'POST',
            path: '/publish-promise',
            headers: {
              'X-INSTANA-L': '0'
            }
          })
          .then(response =>
            retry(() => verifyResponseAndMessage(response, subscriberControls), retryTime)
              .then(() => delay(1000))
              .then(() => agentControls.getSpans())
              .then(spans => {
                if (spans.length > 0) {
                  fail(`Unexpected spans (Google Cloud Run/suppressed: ${stringifyItems(spans)}`);
                }
              })
          ));
    });

    describe('tracing disabled', function () {
      this.timeout(config.getTestTimeout() * 2);

      const topicName = defaultTopicName;
      const subscriptionName = defaultSubscriptionName;

      let publisherControls;
      let subscriberControls;

      before(async () => {
        publisherControls = new ProcessControls({
          appPath: path.join(__dirname, 'publisher'),
          useGlobalAgent: true,
          tracingEnabled: false,
          env: {
            GCP_PROJECT: projectId,
            GCP_PUBSUB_TOPIC: topicName,
            GCP_PUBSUB_SUBSCRIPTION: subscriptionName
          }
        });
        subscriberControls = new ProcessControls({
          appPath: path.join(__dirname, 'subscriber'),
          useGlobalAgent: true,
          tracingEnabled: false,
          env: {
            GCP_PROJECT: projectId,
            GCP_PUBSUB_TOPIC: topicName,
            GCP_PUBSUB_SUBSCRIPTION: subscriptionName
          }
        });

        await publisherControls.startAndWaitForAgentConnection();
        await subscriberControls.startAndWaitForAgentConnection();
      });

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });

      after(async () => {
        await publisherControls.stop();
        await subscriberControls.stop();
      });

      afterEach(async () => {
        await publisherControls.clearIpcMessages();
        await subscriberControls.clearIpcMessages();
      });

      it('should not trace when disabled', () =>
        publisherControls
          .sendRequest({
            method: 'POST',
            path: '/publish-promise'
          })
          .then(response =>
            retry(() => verifyResponseAndMessage(response, subscriberControls), retryTime)
              .then(() => delay(1000))
              .then(() => agentControls.getSpans())
              .then(spans => {
                if (spans.length > 0) {
                  fail(`Unexpected spans (Google Cloud PubSub/suppressed: ${stringifyItems(spans)}`);
                }
              })
          ));
    });
  });
}

function verifyResponseAndMessage(response, subscriberControls) {
  expect(response).to.be.an('object');
  const messageId = response.messageId;
  expect(messageId).to.be.a('string');
  const receivedMessages = subscriberControls.getIpcMessages();
  expect(receivedMessages).to.be.an('array');
  expect(receivedMessages).to.have.lengthOf.at.least(1);
  const message = receivedMessages.filter(({ id }) => id === messageId)[0];
  expect(message).to.exist;
  expect(message.content).to.equal('test message');
  return messageId;
}
