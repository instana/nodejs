'use strict';

const path = require('path');
const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const testUtils = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');

let agentControls;

describe('tracing/kafka-node', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  // Too many moving parts with Kafka involved. Increase the default timeout.
  // This is especially important since the Kafka client has an
  // exponential backoff implemented.
  this.timeout(config.getTestTimeout() * 2);
  agentControls = require('../../../apps/agentStubControls');

  ['plain', 'highLevel'].forEach(producerType => {
    describe(`producing via: ${producerType}`, function() {
      agentControls.registerTestHooks();
      const producerControls = new ProcessControls({
        appPath: path.join(__dirname, 'producer'),
        port: 3216,
        agentControls,
        env: {
          PRODUCER_TYPE: producerType
        }
      }).registerTestHooks();
      const consumerControls = new ProcessControls({
        appPath: path.join(__dirname, 'consumer'),
        agentControls
      }).registerTestHooks();

      it(`must trace sending messages (producer type: ${producerType})`, () =>
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

                // verify that subsequent calls are correctly traced
                testUtils.expectAtLeastOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.client'),
                  span => expect(span.t).to.equal(entrySpan.t),
                  span => expect(span.p).to.equal(entrySpan.s)
                ]);
              })
          )
        ));
    });
  });

  // REMARK: HighLevelConsumer has been removed in kafka-node@4.0.0, so we no longer test the highLevel option in
  // the regular test suite. The consumerGroup test became flaky on CI (but not locally) with the upgrade to
  // kafka-node@4.0.0. Both can be quickly reactivated if kafka-node < 4.0.0 needs to be tested, see remark in
  // ../consumer.js
  // eslint-disable-next-line array-bracket-spacing
  ['plain' /* 'highLevel', 'consumerGroup' */].forEach(consumerType => {
    describe(`consuming via: ${consumerType}`, () => {
      agentControls.registerTestHooks();
      const producerControls = new ProcessControls({
        appPath: path.join(__dirname, 'producer'),
        port: 3216,
        agentControls,
        env: {
          PRODUCER_TYPE: 'plain'
        }
      }).registerTestHooks();
      const consumerControls = new ProcessControls({
        appPath: path.join(__dirname, 'consumer'),
        agentControls,
        env: {
          CONSUMER_TYPE: consumerType
        }
      }).registerTestHooks();

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

  function send(producerControls, key, value, useSendBatch, useEachBatch) {
    return producerControls.sendRequest({
      method: 'POST',
      path: '/send-message',
      simple: true,
      body: {
        useSendBatch,
        useEachBatch,
        key,
        value
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
