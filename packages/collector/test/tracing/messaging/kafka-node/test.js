'use strict';

const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../config');
const utils = require('../../../utils');

let agentControls;
let ProducerControls;
let ConsumerControls;

describe('tracing/kafka-node', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  // Too many moving parts with Kafka involved. Increase the default timeout.
  // This is especially important since the Kafka client has an
  // exponential backoff implemented.
  this.timeout(config.getTestTimeout() * 2);
  agentControls = require('../../../apps/agentStubControls');

  ProducerControls = require('./producerControls');
  ConsumerControls = require('./consumerControls');

  ['plain', 'highLevel'].forEach(producerType => {
    describe(`producing via: ${producerType}`, function() {
      agentControls.registerTestHooks();
      const producerControls = new ProducerControls({
        agentControls,
        env: {
          PRODUCER_TYPE: producerType
        }
      });
      producerControls.registerTestHooks();
      const consumerControls = new ConsumerControls({ agentControls });
      consumerControls.registerTestHooks();

      it(`must trace sending messages (producer type: ${producerType})`, () =>
        send(producerControls, 'someKey', 'someMessage').then(() =>
          utils.retry(() =>
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
                const entrySpan = utils.expectOneMatching(spans, span => {
                  expect(span.n).to.equal('node.http.server');
                  expect(span.f.e).to.equal(String(producerControls.getPid()));
                  expect(span.f.h).to.equal('agent-stub-uuid');
                  expect(span.async).to.equal(false);
                  expect(span.error).to.equal(false);
                });

                utils.expectOneMatching(spans, span => {
                  expect(span.t).to.equal(entrySpan.t);
                  expect(span.p).to.equal(entrySpan.s);
                  expect(span.n).to.equal('kafka');
                  expect(span.k).to.equal(constants.EXIT);
                  expect(span.f.e).to.equal(String(producerControls.getPid()));
                  expect(span.f.h).to.equal('agent-stub-uuid');
                  expect(span.async).to.equal(false);
                  expect(span.error).to.equal(false);
                  expect(span.data.kafka.access).to.equal('send');
                  expect(span.data.kafka.service).to.equal('test');
                });

                // verify that subsequent calls are correctly traced
                utils.expectOneMatching(spans, span => {
                  expect(span.n).to.equal('node.http.client');
                  expect(span.t).to.equal(entrySpan.t);
                  expect(span.p).to.equal(entrySpan.s);
                });
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
      const producerControls = new ProducerControls({
        agentControls,
        env: {
          PRODUCER_TYPE: 'plain'
        }
      });
      producerControls.registerTestHooks();
      const consumerControls = new ConsumerControls({
        agentControls,
        env: {
          CONSUMER_TYPE: consumerType
        }
      });
      consumerControls.registerTestHooks();

      it(`must trace receiving messages (consumer type: ${consumerType})`, () =>
        send(producerControls, 'someKey', 'someMessage').then(() =>
          utils.retry(() =>
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
                const entrySpan = utils.expectOneMatching(spans, span => {
                  expect(span.n).to.equal('node.http.server');
                  expect(span.f.e).to.equal(String(producerControls.getPid()));
                  expect(span.f.h).to.equal('agent-stub-uuid');
                  expect(span.async).to.equal(false);
                  expect(span.error).to.equal(false);
                });
                utils.expectOneMatching(spans, span => {
                  expect(span.t).to.equal(entrySpan.t);
                  expect(span.p).to.equal(entrySpan.s);
                  expect(span.n).to.equal('kafka');
                  expect(span.k).to.equal(constants.EXIT);
                  expect(span.f.e).to.equal(String(producerControls.getPid()));
                  expect(span.f.h).to.equal('agent-stub-uuid');
                  expect(span.async).to.equal(false);
                  expect(span.error).to.equal(false);
                  expect(span.data.kafka.access).to.equal('send');
                  expect(span.data.kafka.service).to.equal('test');
                });

                // Actually, we would want the trace started at the HTTP entry to continue here but as of 2019-07-31,
                // version 4.1.3, kafka-node _still_ has no support for message headers, so we are out of luck in
                // Node.js/kafka. See
                // https://github.com/SOHU-Co/kafka-node/issues/763
                // So for now, span.p is undefined (new root span) and span.t is not equal to entrySpan.t.
                const kafkaConsumeEntry = utils.expectOneMatching(spans, span => {
                  expect(span.p).to.equal(undefined);
                  expect(span.n).to.equal('kafka');
                  expect(span.k).to.equal(constants.ENTRY);
                  expect(span.d).to.be.greaterThan(99);
                  expect(span.f.e).to.equal(String(consumerControls.getPid()));
                  expect(span.f.h).to.equal('agent-stub-uuid');
                  expect(span.async).to.equal(false);
                  expect(span.error).to.equal(false);
                  expect(span.data.kafka.access).to.equal('consume');
                  expect(span.data.kafka.service).to.equal('test');
                });
                // verify that subsequent calls are correctly traced
                utils.expectOneMatching(spans, span => {
                  expect(span.n).to.equal('node.http.client');
                  expect(span.t).to.equal(kafkaConsumeEntry.t);
                  expect(span.p).to.equal(kafkaConsumeEntry.s);
                });
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
