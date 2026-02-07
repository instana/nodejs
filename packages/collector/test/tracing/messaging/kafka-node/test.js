/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const path = require('path');
const expect = require('chai').expect;

const constants = require('@_local/core').tracing.constants;
const supportedVersion = require('@_local/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const testUtils = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');

const agentControls = globalAgent.instance;

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

// FYI: officially deprecated. No release since 6 years. But still very
//      high usage on npm trends. We will drop in any upcoming major release.

// node bin/start-test-containers.js --zookeeper --kafka --schema-registry --kafka-topics
mochaSuiteFn('tracing/kafka-node', function () {
  // Too many moving parts with Kafka involved. Increase the default timeout.
  // This is especially important since the Kafka client has an
  // exponential backoff implemented.
  this.timeout(config.getTestTimeout() * 2);

  globalAgent.setUpCleanUpHooks();

  ['plain', 'highLevel'].forEach(producerType => {
    describe(`producing via: ${producerType}`, function () {
      let producerControls;
      let consumerControls;

      before(async () => {
        producerControls = new ProcessControls({
          appPath: path.join(__dirname, 'producer'),
          useGlobalAgent: true,
          env: {
            PRODUCER_TYPE: producerType
          }
        });
        consumerControls = new ProcessControls({
          appPath: path.join(__dirname, 'consumer'),
          useGlobalAgent: true
        });

        await consumerControls.startAndWaitForAgentConnection();
        await producerControls.startAndWaitForAgentConnection();
      });

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });

      after(async () => {
        await producerControls.stop();
        await consumerControls.stop();
      });

      it(`must trace sending messages (producer type: ${producerType})`, () => {
        return send(producerControls, 'someKey', 'someMessage').then(() => {
          return testUtils.retry(() => {
            return getErrors(consumerControls)
              .then(errors => {
                expect(errors).to.be.an('array');
                expect(errors).to.be.empty;
                return getMessages(consumerControls);
              })
              .then(messages => {
                expect(messages).to.be.an('array');
                expect(messages).to.have.lengthOf.at.least(1);
                const message = messages[messages.length - 1];
                expect(message.key).to.equal('someKey');
                expect(message.value).to.equal('someMessage');
                return agentControls.getSpans();
              })
              .then(spans => {
                const entrySpan = testUtils.expectAtLeastOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.server'),
                  span => expect(span.f.e).to.equal(String(producerControls.getPid())),
                  span => expect(span.f.h).to.equal('agent-stub-uuid'),
                  span => expect(span.async).to.not.exist,
                  span => expect(span.error).to.not.exist,
                  span => expect(span.ec).to.equal(0)
                ]);

                testUtils.expectAtLeastOneMatching(spans, [
                  span => expect(span.t).to.equal(entrySpan.t),
                  span => expect(span.p).to.equal(entrySpan.s),
                  span => expect(span.n).to.equal('kafka'),
                  span => expect(span.k).to.equal(constants.EXIT),
                  span => expect(span.f.e).to.equal(String(producerControls.getPid())),
                  span => expect(span.f.h).to.equal('agent-stub-uuid'),
                  span => expect(span.async).to.not.exist,
                  span => expect(span.error).to.not.exist,
                  span => expect(span.ec).to.equal(0),
                  span => expect(span.data.kafka.access).to.equal('send'),
                  span => expect(span.data.kafka.service).to.equal('test')
                ]);

                // verify that subsequent calls are correctly traced
                testUtils.expectAtLeastOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.client'),
                  span => expect(span.t).to.equal(entrySpan.t),
                  span => expect(span.p).to.equal(entrySpan.s)
                ]);
              });
          });
        });
      });
    });
  });

  // REMARK: HighLevelConsumer has been removed in kafka-node@4.0.0, so we no longer test the highLevel option in
  // the regular test suite. The consumerGroup test became flaky on CI (but not locally) with the upgrade to
  // kafka-node@4.0.0. Both can be quickly reactivated if kafka-node < 4.0.0 needs to be tested, see remark in
  // ../consumer.js
  // eslint-disable-next-line array-bracket-spacing
  ['plain' /* 'highLevel', 'consumerGroup' */].forEach(consumerType => {
    describe(`consuming via: ${consumerType}`, () => {
      let producerControls;
      let consumerControls;

      before(async () => {
        producerControls = new ProcessControls({
          appPath: path.join(__dirname, 'producer'),
          useGlobalAgent: true,
          env: {
            PRODUCER_TYPE: 'plain'
          }
        });
        consumerControls = new ProcessControls({
          appPath: path.join(__dirname, 'consumer'),
          useGlobalAgent: true,
          env: {
            CONSUMER_TYPE: consumerType
          }
        });

        await producerControls.startAndWaitForAgentConnection();
        await consumerControls.startAndWaitForAgentConnection();
      });

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });

      after(async () => {
        await producerControls.stop();
        await consumerControls.stop();
      });

      it(`must trace receiving messages (consumer type: ${consumerType})`, () =>
        send(producerControls, 'someKey', 'someMessage').then(() =>
          testUtils.retry(() =>
            getErrors(consumerControls)
              .then(errors => {
                expect(errors).to.be.an('array');
                expect(errors).to.be.empty;
                return getMessages(consumerControls);
              })
              .then(messages => {
                expect(messages).to.be.an('array');
                expect(messages).to.have.lengthOf.at.least(1);
                const message = messages[messages.length - 1];
                expect(message.key).to.equal('someKey');
                expect(message.value).to.equal('someMessage');
                return agentControls.getSpans();
              })
              .then(spans => {
                const entrySpan = testUtils.expectAtLeastOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.server'),
                  span => expect(span.f.e).to.equal(String(producerControls.getPid())),
                  span => expect(span.f.h).to.equal('agent-stub-uuid'),
                  span => expect(span.async).to.not.exist,
                  span => expect(span.error).to.not.exist,
                  span => expect(span.ec).to.equal(0)
                ]);
                testUtils.expectAtLeastOneMatching(spans, [
                  span => expect(span.t).to.equal(entrySpan.t),
                  span => expect(span.p).to.equal(entrySpan.s),
                  span => expect(span.n).to.equal('kafka'),
                  span => expect(span.k).to.equal(constants.EXIT),
                  span => expect(span.f.e).to.equal(String(producerControls.getPid())),
                  span => expect(span.f.h).to.equal('agent-stub-uuid'),
                  span => expect(span.async).to.not.exist,
                  span => expect(span.error).to.not.exist,
                  span => expect(span.ec).to.equal(0),
                  span => expect(span.data.kafka.access).to.equal('send'),
                  span => expect(span.data.kafka.service).to.equal('test')
                ]);

                // Actually, we would want the trace started at the HTTP entry to continue here but as of 2019-07-31,
                // version 4.1.3, kafka-node _still_ has no support for message headers, so we are out of luck in
                // Node.js/kafka. See
                // https://github.com/SOHU-Co/kafka-node/issues/763
                // So for now, span.p is undefined (new root span) and span.t is not equal to entrySpan.t.
                const kafkaConsumeEntry = testUtils.expectAtLeastOneMatching(spans, [
                  span => expect(span.p).to.equal(undefined),
                  span => expect(span.n).to.equal('kafka'),
                  span => expect(span.k).to.equal(constants.ENTRY),
                  span => expect(span.d).to.be.greaterThan(99),
                  span => expect(span.f.e).to.equal(String(consumerControls.getPid())),
                  span => expect(span.f.h).to.equal('agent-stub-uuid'),
                  span => expect(span.async).to.not.exist,
                  span => expect(span.error).to.not.exist,
                  span => expect(span.ec).to.equal(0),
                  span => expect(span.data.kafka.access).to.equal('consume'),
                  span => expect(span.data.kafka.service).to.equal('test')
                ]);
                // verify that subsequent calls are correctly traced
                testUtils.expectAtLeastOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.client'),
                  span => expect(span.t).to.equal(kafkaConsumeEntry.t),
                  span => expect(span.p).to.equal(kafkaConsumeEntry.s)
                ]);
              })
          )
        ));
    });
  });

  // kafka-node does not support headers: https://github.com/SOHU-Co/kafka-node/issues/1309
  // We cannot inject our Instana headers.
  describe.skip('Suppression', () => {
    let producerControls;
    let consumerControls;

    before(async () => {
      producerControls = new ProcessControls({
        appPath: path.join(__dirname, 'producer'),
        useGlobalAgent: true,
        env: {
          PRODUCER_TYPE: 'plain'
        }
      });
      consumerControls = new ProcessControls({
        appPath: path.join(__dirname, 'consumer'),
        useGlobalAgent: true,
        env: {
          CONSUMER_TYPE: 'plain'
        }
      });

      await producerControls.startAndWaitForAgentConnection();
      await consumerControls.startAndWaitForAgentConnection();
    });

    beforeEach(async () => {
      await agentControls.clearReceivedTraceData();
    });

    after(async () => {
      await producerControls.stop();
      await consumerControls.stop();
    });

    it('[suppressed] should not trace', async () => {
      await send(producerControls, 'someKey', 'someMessage', false, false, true);
      await testUtils.delay(1000);

      const spans = await agentControls.getSpans();
      expect(spans.length).to.equal(0);
    });
  });

  function send(producerControls, key, value, useSendBatch, useEachBatch, isSuppressed = false) {
    return producerControls.sendRequest({
      method: 'POST',
      path: '/send-message',
      simple: true,
      suppressTracing: isSuppressed,
      body: JSON.stringify({
        useSendBatch,
        useEachBatch,
        key,
        value
      }),
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  function getMessages(consumerControls) {
    return consumerControls.sendRequest({ path: '/messages', suppressTracing: true });
  }

  function getErrors(consumerControls) {
    return consumerControls.sendRequest({ path: '/errors', suppressTracing: true });
  }
});
