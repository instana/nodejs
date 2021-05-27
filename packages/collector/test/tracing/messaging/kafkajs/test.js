/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const path = require('path');
const expect = require('chai').expect;
const semver = require('semver');

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const delay = require('../../../../../core/test/test_util/delay');
const testUtils = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');

const mochaSuiteFn =
  supportedVersion(process.versions.node) &&
  // kafkajs uses async/await style which is only available on Node.js >= 8.
  semver.gte(process.versions.node, '8.0.0')
    ? describe
    : describe.skip;

mochaSuiteFn('tracing/kafkajs', function () {
  this.timeout(config.getTestTimeout() * 2);

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  let producerControls;
  let consumerControls;

  describe('tracing enabled ', function () {
    producerControls = new ProcessControls({
      appPath: path.join(__dirname, 'producer'),
      port: 3216,
      useGlobalAgent: true
    });
    consumerControls = new ProcessControls({
      appPath: path.join(__dirname, 'consumer'),
      useGlobalAgent: true
    });
    ProcessControls.setUpHooks(producerControls, consumerControls);

    beforeEach(() => resetMessages(consumerControls));
    afterEach(() => resetMessages(consumerControls));

    [false, 'sender', 'receiver'].forEach(error =>
      [false, true].forEach(useSendBatch =>
        [false, true].forEach(useEachBatch => registerTestSuite.bind(this)(error, useSendBatch, useEachBatch))
      )
    );
    // registerTestSuite.bind(this)(false, false, false);

    function registerTestSuite(error, useSendBatch, useEachBatch) {
      describe(`kafkajs (${
        useSendBatch ? 'sendBatch' : 'sendMessage'
      } => ${useEachBatch ? 'eachBatch' : 'eachMessage'}, error: ${error})`, () => {
        it(`must trace sending and receiving and keep trace continuity (${
          useSendBatch ? 'sendBatch' : 'sendMessage'
        } => ${useEachBatch ? 'eachBatch' : 'eachMessage'}, error: ${error})`, () => {
          const parameters = { error, useSendBatch, useEachBatch };
          return send({
            key: 'someKey',
            value: 'someMessage',
            error,
            useSendBatch,
            useEachBatch
          }).then(() =>
            testUtils.retry(() =>
              getMessages(consumerControls)
                .then(messages => {
                  checkMessages(messages, parameters);
                  return agentControls.getSpans();
                })
                .then(spans => {
                  const httpEntry = verifyHttpEntry(spans);
                  verifyKafkaExits(spans, httpEntry, parameters);
                  verifyFollowUpHttpExit(spans, httpEntry);
                })
            )
          );
        });

        if (error === false) {
          // we do not need dedicated suppression tests for error conditions
          it('must not trace when suppressed', () => {
            const parameters = { error, useSendBatch, useEachBatch };

            return send({
              key: 'someKey',
              value: 'someMessage',
              error,
              useSendBatch,
              useEachBatch,
              suppressTracing: true
            }).then(() =>
              testUtils.retry(() =>
                getMessages(consumerControls)
                  .then(messages => {
                    checkMessages(messages, parameters);
                    return delay(config.getTestTimeout() / 4);
                  })
                  .then(() => agentControls.getSpans())
                  .then(spans => expect(spans).to.have.lengthOf(0))
              )
            );
          });
        }
      });
    }
  });

  describe('kafkajs disabled', () => {
    producerControls = new ProcessControls({
      appPath: path.join(__dirname, 'producer'),
      port: 3216,
      useGlobalAgent: true,
      tracingEnabled: false
    });
    consumerControls = new ProcessControls({
      appPath: path.join(__dirname, 'consumer'),
      useGlobalAgent: true,
      tracingEnabled: false
    });
    ProcessControls.setUpHooks(producerControls, consumerControls);

    beforeEach(() => resetMessages(consumerControls));
    afterEach(() => resetMessages(consumerControls));

    it('must not trace when disabled', () => {
      const parameters = { error: false, useSendBatch: false, useEachBatch: false };

      return send({
        key: 'someKey',
        value: 'someMessage',
        error: false,
        useSendBatch: false,
        useEachBatch: false
      }).then(() =>
        testUtils.retry(() =>
          getMessages(consumerControls)
            .then(messages => {
              checkMessages(messages, parameters);
              return delay(config.getTestTimeout() / 4);
            })
            .then(() => agentControls.getSpans())
            .then(spans => expect(spans).to.have.lengthOf(0))
        )
      );
    });
  });

  // eslint-disable-next-line object-curly-newline
  function send({ key, value, error, useSendBatch, useEachBatch, suppressTracing }) {
    const req = {
      method: 'POST',
      path: '/send-messages',
      simple: true,
      suppressTracing,
      body: {
        key,
        value,
        error,
        useSendBatch,
        useEachBatch
      }
    };
    return producerControls.sendRequest(req);
  }

  function resetMessages(consumer) {
    return consumer.sendRequest({
      path: '/messages',
      method: 'DELETE',
      suppressTracing: true
    });
  }

  function getMessages(consumer) {
    return consumer.sendRequest({
      path: '/messages',
      suppressTracing: true
    });
  }

  function checkMessages(messages, { error, useSendBatch, useEachBatch }) {
    expect(messages).to.be.an('array');
    if (error) {
      expect(messages).to.be.empty;
      return;
    }

    const numberOfMessages = useSendBatch ? 3 : 2;
    expect(messages).to.have.lengthOf(numberOfMessages);

    const topicPrefix = getTopicPrefix(useEachBatch);

    const msgsPerTopic = {
      [`${topicPrefix}-1`]: 0,
      [`${topicPrefix}-2`]: 0
    };
    for (let i = 0; i < numberOfMessages; i++) {
      expect(messages[i].key).to.equal('someKey');
      expect(messages[i].value).to.equal('someMessage');
      msgsPerTopic[messages[i].topic]++;
    }
    expect(msgsPerTopic).to.deep.equal({
      [`${topicPrefix}-1`]: 2,
      [`${topicPrefix}-2`]: useSendBatch ? 1 : 0
    });
  }

  function verifyHttpEntry(spans) {
    return testUtils.expectAtLeastOneMatching(spans, [
      span => expect(span.n).to.equal('node.http.server'),
      span => expect(span.f.h).to.equal('agent-stub-uuid'),
      span => expect(span.async).to.not.exist,
      span => expect(span.error).to.not.exist,
      span => expect(span.ec).to.equal(0)
    ]);
  }

  function verifyKafkaExits(spans, httpEntry, parameters) {
    const { error, useSendBatch, useEachBatch } = parameters;
    const topicPrefix = getTopicPrefix(useEachBatch);

    const expectedTopics = useSendBatch ? `${topicPrefix}-1,${topicPrefix}-2` : `${topicPrefix}-1`;
    const expectedBatchCount = useSendBatch ? 3 : 2;
    const kafkaExit = testUtils.expectAtLeastOneMatching(spans, span => {
      expect(span.t).to.equal(httpEntry.t);
      expect(span.p).to.equal(httpEntry.s);
      expect(span.n).to.equal('kafka');
      expect(span.k).to.equal(constants.EXIT);
      expect(span.f.h).to.equal('agent-stub-uuid');
      expect(span.async).to.not.exist;
      if (error === 'sender') {
        expect(span.ec).to.equal(1);
        expect(span.error).to.not.exist;
        expect(span.data.kafka.error).to.contain('Invalid message without value for topic');
      } else {
        expect(span.ec).to.equal(0);
        expect(span.error).to.not.exist;
        expect(span.data.kafka.error).to.not.exist;
        // We always send 2 messages for topic 1 (also via the normal send method), no matter if useSendBatch is true.
        // With useSendBatch === true, we use a different API which allows sending messages to multiple topics
        // at once (see below).
      }
      expect(span.data.kafka.access).to.equal('send');
      expect(span.data.kafka.service).to.equal(expectedTopics);
      expect(span.b).to.deep.equal({ s: expectedBatchCount });
    });
    verifyKafkaEntries(spans, kafkaExit, parameters);
  }

  function verifyFollowUpHttpExit(spans, entry) {
    // verify that subsequent calls are correctly traced after creating a kafka entry/exit
    testUtils.expectAtLeastOneMatching(spans, [
      span => expect(span.n).to.equal('node.http.client'),
      span => expect(span.t).to.equal(entry.t),
      span => expect(span.p).to.equal(entry.s)
    ]);
  }

  function verifyKafkaEntries(spans, parentKafkaExit, parameters) {
    const { error, useSendBatch, useEachBatch } = parameters;
    if (error === 'sender') {
      return;
    }
    const topicPrefix = getTopicPrefix(useEachBatch);
    const firstKafkaEntry = testUtils.expectAtLeastOneMatching(spans, span => {
      expect(span.t).to.equal(parentKafkaExit.t);
      expect(span.p).to.equal(parentKafkaExit.s);
      expect(span.n).to.equal('kafka');
      expect(span.k).to.equal(constants.ENTRY);
      expect(span.f.h).to.equal('agent-stub-uuid');
      expect(span.async).to.not.exist;
      expect(span.data.kafka.access).to.equal('consume');
      expect(span.data.kafka.service).to.equal(`${topicPrefix}-1`);
      if (error === 'receiver') {
        expect(span.ec).to.equal(1);
        expect(span.error).to.not.exist;
      } else {
        expect(span.d).to.be.greaterThan(99);
        expect(span.ec).to.equal(0);
        expect(span.error).to.not.exist;
      }
      if (useEachBatch) {
        expect(span.b).to.deep.equal({ s: 2 });
      } else {
        expect(span.b).to.not.exist;
      }
    });
    if (error !== 'receiver') {
      verifyFollowUpHttpExit(spans, firstKafkaEntry);
    }

    if (!useEachBatch) {
      const secondKafkaEntry = testUtils.expectAtLeastOneMatching(spans, span => {
        expect(span.t).to.equal(parentKafkaExit.t);
        expect(span.p).to.equal(parentKafkaExit.s);
        expect(span.n).to.equal('kafka');
        expect(span.s).to.not.equal(firstKafkaEntry.s); // we expect two _different_ entry spans
        expect(span.k).to.equal(constants.ENTRY);

        expect(span.f.h).to.equal('agent-stub-uuid');
        expect(span.async).to.not.exist;
        expect(span.data.kafka.access).to.equal('consume');
        expect(span.data.kafka.service).to.equal(`${topicPrefix}-1`);
        expect(span.b).to.not.exist;
        if (error === 'receiver') {
          expect(span.ec).to.equal(1);
          expect(span.error).to.not.exist;
        } else {
          expect(span.d).to.be.greaterThan(99);
          expect(span.ec).to.equal(0);
          expect(span.error).to.not.exist;
        }
      });
      if (error !== 'receiver') {
        verifyFollowUpHttpExit(spans, secondKafkaEntry);
      }
    }

    if (useSendBatch) {
      const thirdKafkaEntry = testUtils.expectAtLeastOneMatching(spans, span => {
        expect(span.t).to.equal(parentKafkaExit.t);
        expect(span.p).to.equal(parentKafkaExit.s);
        expect(span.n).to.equal('kafka');
        expect(span.k).to.equal(constants.ENTRY);
        expect(span.f.h).to.equal('agent-stub-uuid');
        expect(span.async).to.not.exist;
        expect(span.data.kafka.access).to.equal('consume');
        expect(span.data.kafka.service).to.equal(`${topicPrefix}-2`);
        if (error === 'receiver') {
          expect(span.ec).to.equal(1);
          expect(span.error).to.not.exist;
        } else {
          expect(span.d).to.be.greaterThan(99);
          expect(span.ec).to.equal(0);
          expect(span.error).to.not.exist;
        }
        if (useEachBatch) {
          expect(span.b).to.deep.equal({ s: 1 });
        } else {
          expect(span.b).to.not.exist;
        }
      });
      if (error !== 'receiver') {
        verifyFollowUpHttpExit(spans, thirdKafkaEntry);
      }
    }
  }

  function getTopicPrefix(useEachBatch) {
    return useEachBatch ? 'test-batch-topic' : 'test-topic';
  }
});
