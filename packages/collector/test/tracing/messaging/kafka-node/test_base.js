/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const path = require('path');
const expect = require('chai').expect;

const constants = require('@_local/core').tracing.constants;
const config = require('@_local/core/test/config');
const testUtils = require('@_local/core/test/test_util');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const globalAgent = require('@_local/collector/test/globalAgent');

const agentControls = globalAgent.instance;

// FYI: officially deprecated. No release since 6 years. But still very
//      high usage on npm trends. We will drop in any upcoming major release.

// node bin/start-test-containers.js --zookeeper --kafka --schema-registry --kafka-topics
module.exports = function (name, version, isLatest) {
  this.timeout(config.getTestTimeout() * 2);

  const commonEnv = {
    LIBRARY_LATEST: isLatest,
    LIBRARY_VERSION: version,
    LIBRARY_NAME: name
  };

  globalAgent.setUpCleanUpHooks();

  ['plain', 'highLevel'].forEach(producerType => {
    describe(`producing via: ${producerType}`, function () {
      let producerControls;
      let consumerControls;

      before(async () => {
        producerControls = new ProcessControls({
          dirname: __dirname,
          appName: 'producer.js',
          useGlobalAgent: true,
          env: {
            ...commonEnv,
            PRODUCER_TYPE: producerType
          }
        });
        consumerControls = new ProcessControls({
          dirname: __dirname,
          appName: 'consumer.js',
          useGlobalAgent: true,
          env: {
            ...commonEnv
          }
        });

        await consumerControls.startAndWaitForAgentConnection();
        await producerControls.startAndWaitForAgentConnection();
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

  // eslint-disable-next-line array-bracket-spacing
  ['plain' /* 'highLevel', 'consumerGroup' */].forEach(consumerType => {
    describe(`consuming via: ${consumerType}`, () => {
      let producerControls;
      let consumerControls;

      before(async () => {
        producerControls = new ProcessControls({
          dirname: __dirname,
          appName: 'producer.js',
          useGlobalAgent: true,
          env: {
            ...commonEnv,
            PRODUCER_TYPE: 'plain'
          }
        });
        consumerControls = new ProcessControls({
          dirname: __dirname,
          appName: 'consumer.js',
          useGlobalAgent: true,
          env: {
            ...commonEnv,
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
  describe.skip('Suppression', () => {
    let producerControls;
    let consumerControls;

    before(async () => {
      producerControls = new ProcessControls({
        dirname: __dirname,
        appName: 'producer.js',
        useGlobalAgent: true,
        env: {
          ...commonEnv,
          PRODUCER_TYPE: 'plain'
        }
      });
      consumerControls = new ProcessControls({
        dirname: __dirname,
        appName: 'consumer.js',
        useGlobalAgent: true,
        env: {
          ...commonEnv,
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
};
