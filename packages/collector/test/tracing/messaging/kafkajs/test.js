'use strict';

const expect = require('chai').expect;
const semver = require('semver');

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../config');
const delay = require('../../../test_util/delay');
const utils = require('../../../utils');

describe('tracing/kafkajs', function() {
  // kafkajs uses async/await style which is only available on Node.js >= 8.
  if (!supportedVersion(process.versions.node) || semver.lt(process.versions.node, '8.0.0')) {
    return;
  }

  this.timeout(config.getTestTimeout() * 2);

  let agentControls;
  let producerControls;
  let consumerControls;

  describe('tracing enabled ', function() {
    agentControls = require('../../../apps/agentStubControls');
    agentControls.registerTestHooks();

    const ProducerControls = require('./producerControls');
    producerControls = new ProducerControls({ agentControls });
    producerControls.registerTestHooks();
    const ConsumerControls = require('./consumerControls');
    consumerControls = new ConsumerControls({ agentControls });
    consumerControls.registerTestHooks();

    [false, 'sender', 'receiver'].forEach(error =>
      [false, true].forEach(useSendBatch =>
        [false, true].forEach(useEachBatch => registerTestSuite.bind(this)(error, useSendBatch, useEachBatch))
      )
    );
    // registerTestSuite.bind(this)(false, false, false);

    function registerTestSuite(error, useSendBatch, useEachBatch) {
      describe(`kafkajs (${useSendBatch ? 'sendBatch' : 'sendMessage'} => ${
        useEachBatch ? 'eachBatch' : 'eachMessage'
      }, error: ${error})`, () => {
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
            utils.retry(() =>
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
              suppress: true
            }).then(() =>
              utils.retry(() =>
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
    agentControls = require('../../../apps/agentStubControls');
    agentControls.registerTestHooks();

    const ProducerControls = require('./producerControls');
    producerControls = new ProducerControls({
      agentControls,
      tracingEnabled: false
    });
    producerControls.registerTestHooks();
    const ConsumerControls = require('./consumerControls');
    consumerControls = new ConsumerControls({
      agentControls,
      tracingEnabled: false
    });
    consumerControls.registerTestHooks();

    it('must not trace when disabled', () => {
      const parameters = { error: false, useSendBatch: false, useEachBatch: false };

      return send({
        key: 'someKey',
        value: 'someMessage',
        error: false,
        useSendBatch: false,
        useEachBatch: false
      }).then(() =>
        utils.retry(() =>
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
  function send({ key, value, error, useSendBatch, useEachBatch, suppress }) {
    const req = {
      method: 'POST',
      path: '/send-messages',
      simple: true,
      body: {
        key,
        value,
        error,
        useSendBatch,
        useEachBatch
      }
    };
    if (suppress) {
      req.headers = {
        'X-INSTANA-L': '0'
      };
    }
    return producerControls.sendRequest(req);
  }

  function getMessages(consumer) {
    return consumer.sendRequest({ path: '/messages', suppressTracing: true });
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
    return utils.expectOneMatching(spans, span => {
      expect(span.n).to.equal('node.http.server');
      expect(span.f.h).to.equal('agent-stub-uuid');
      expect(span.async).to.equal(false);
      expect(span.error).to.equal(false);
    });
  }

  function verifyKafkaExits(spans, httpEntry, parameters) {
    const { error, useSendBatch, useEachBatch } = parameters;
    const topicPrefix = getTopicPrefix(useEachBatch);

    const expectedTopics = useSendBatch ? `${topicPrefix}-1,${topicPrefix}-2` : `${topicPrefix}-1`;
    const expectedBatchCount = useSendBatch ? 3 : 2;
    const kafkaExit = utils.expectOneMatching(spans, span => {
      expect(span.t).to.equal(httpEntry.t);
      expect(span.p).to.equal(httpEntry.s);
      expect(span.n).to.equal('kafka');
      expect(span.k).to.equal(constants.EXIT);
      expect(span.f.h).to.equal('agent-stub-uuid');
      expect(span.async).to.equal(false);
      if (error === 'sender') {
        expect(span.ec).to.equal(1);
        expect(span.error).to.be.true;
        expect(span.data.kafka.error).to.contain('Invalid message without value for topic');
      } else {
        expect(span.ec).to.equal(0);
        expect(span.error).to.be.false;
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
    utils.expectOneMatching(spans, span => {
      expect(span.n).to.equal('node.http.client');
      expect(span.t).to.equal(entry.t);
      expect(span.p).to.equal(entry.s);
    });
  }

  function verifyKafkaEntries(spans, parentKafkaExit, parameters) {
    const { error, useSendBatch, useEachBatch } = parameters;
    if (error === 'sender') {
      return;
    }
    const topicPrefix = getTopicPrefix(useEachBatch);
    const firstKafkaEntry = utils.expectOneMatching(spans, span => {
      expect(span.t).to.equal(parentKafkaExit.t);
      expect(span.p).to.equal(parentKafkaExit.s);
      expect(span.n).to.equal('kafka');
      expect(span.k).to.equal(constants.ENTRY);
      expect(span.f.h).to.equal('agent-stub-uuid');
      expect(span.async).to.equal(false);
      expect(span.data.kafka.access).to.equal('consume');
      expect(span.data.kafka.service).to.equal(`${topicPrefix}-1`);
      if (error === 'receiver') {
        expect(span.ec).to.equal(1);
        expect(span.error).to.be.true;
      } else {
        expect(span.d).to.be.greaterThan(99);
        expect(span.ec).to.equal(0);
        expect(span.error).to.be.false;
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
      const secondKafkaEntry = utils.expectOneMatching(spans, span => {
        expect(span.t).to.equal(parentKafkaExit.t);
        expect(span.p).to.equal(parentKafkaExit.s);
        expect(span.n).to.equal('kafka');
        expect(span.s).to.not.equal(firstKafkaEntry.s); // we expect two _different_ entry spans
        expect(span.k).to.equal(constants.ENTRY);

        expect(span.f.h).to.equal('agent-stub-uuid');
        expect(span.async).to.equal(false);
        expect(span.data.kafka.access).to.equal('consume');
        expect(span.data.kafka.service).to.equal(`${topicPrefix}-1`);
        expect(span.b).to.not.exist;
        if (error === 'receiver') {
          expect(span.ec).to.equal(1);
          expect(span.error).to.be.true;
        } else {
          expect(span.d).to.be.greaterThan(99);
          expect(span.ec).to.equal(0);
          expect(span.error).to.be.false;
        }
      });
      if (error !== 'receiver') {
        verifyFollowUpHttpExit(spans, secondKafkaEntry);
      }
    }

    if (useSendBatch) {
      const thirdKafkaEntry = utils.expectOneMatching(spans, span => {
        expect(span.t).to.equal(parentKafkaExit.t);
        expect(span.p).to.equal(parentKafkaExit.s);
        expect(span.n).to.equal('kafka');
        expect(span.k).to.equal(constants.ENTRY);
        expect(span.f.h).to.equal('agent-stub-uuid');
        expect(span.async).to.equal(false);
        expect(span.data.kafka.access).to.equal('consume');
        expect(span.data.kafka.service).to.equal(`${topicPrefix}-2`);
        if (error === 'receiver') {
          expect(span.ec).to.equal(1);
          expect(span.error).to.be.true;
        } else {
          expect(span.d).to.be.greaterThan(99);
          expect(span.ec).to.equal(0);
          expect(span.error).to.be.false;
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
