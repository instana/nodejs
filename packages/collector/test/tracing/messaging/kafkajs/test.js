/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const path = require('path');
const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('@instana/core/test/config');
const {
  delay,
  expectAtLeastOneMatching,
  getCircularList,
  getSpansByName,
  retry
} = require('@instana/core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');
const { AgentStubControls } = require('../../../apps/agentStubControls');

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/kafkajs', function () {
  this.timeout(config.getTestTimeout() * 2);

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  let producerControls;
  let consumerControls;

  describe('tracing enabled ', function () {
    consumerControls = new ProcessControls({
      appPath: path.join(__dirname, 'consumer'),
      useGlobalAgent: true
    });
    ProcessControls.setUpHooks(consumerControls);

    const nextUseEachBatch = getCircularList([false, true]);
    const nextError = getCircularList([false, 'consumer']);

    ['binary', 'string', 'both'].forEach(headerFormat => {
      describe(`header format: ${headerFormat}`, function () {
        producerControls = new ProcessControls({
          appPath: path.join(__dirname, 'producer'),
          port: 3216,
          useGlobalAgent: true,
          env: {
            INSTANA_KAFKA_HEADER_FORMAT: headerFormat
          }
        });
        ProcessControls.setUpHooks(producerControls);

        beforeEach(() => resetMessages(consumerControls));
        afterEach(() => resetMessages(consumerControls));

        [false, true].forEach(useSendBatch =>
          registerTracingEnabledTestSuite.bind(this)({ headerFormat, nextError, useSendBatch, nextUseEachBatch })
        );
      });
    });

    function registerTracingEnabledTestSuite({ headerFormat, useSendBatch }) {
      const useEachBatch = nextUseEachBatch();
      const error = nextError();
      describe(
        `kafkajs (header format: ${headerFormat}, ${useSendBatch ? 'sendBatch' : 'sendMessage'} => ` +
          `${useEachBatch ? 'eachBatch' : 'eachMessage'}, error: ${error})`,
        () => {
          it(`must trace sending and receiving and keep trace continuity (header format: ${headerFormat}, ${
            useSendBatch ? 'sendBatch' : 'sendMessage'
          } => ${useEachBatch ? 'eachBatch' : 'eachMessage'}, error: ${error})`, () => {
            const parameters = {
              headerFormat,
              error,
              useSendBatch,
              useEachBatch
            };
            return send({
              key: 'someKey',
              value: 'someMessage',
              error,
              useSendBatch,
              useEachBatch
            }).then(() =>
              retry(() =>
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
            it(`must not trace when suppressed (header format: ${headerFormat})`, () => {
              const parameters = { headerFormat, error, useSendBatch, useEachBatch };
              return send({
                key: 'someKey',
                value: 'someMessage',
                error,
                useSendBatch,
                useEachBatch,
                suppressTracing: true
              }).then(() =>
                retry(() =>
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
        }
      );
    }
  });

  describe('with error in producer ', function () {
    const headerFormat = 'string';
    producerControls = new ProcessControls({
      appPath: path.join(__dirname, 'producer'),
      port: 3216,
      useGlobalAgent: true,
      env: {
        INSTANA_KAFKA_HEADER_FORMAT: headerFormat
      }
    });
    ProcessControls.setUpHooks(producerControls);

    [false, true].forEach(useSendBatch => registerProducerErrorTestSuite.bind(this)({ headerFormat, useSendBatch }));

    function registerProducerErrorTestSuite({ useSendBatch }) {
      const error = 'producer';
      const useEachBatch = false;
      describe(
        `kafkajs (header format: ${headerFormat}, ${useSendBatch ? 'sendBatch' : 'sendMessage'} => ` +
          `${useEachBatch ? 'eachBatch' : 'eachMessage'}, error: ${error})`,
        () => {
          it(`must trace attempts to send a message when an error happens in the producer (${
            useSendBatch ? 'sendBatch' : 'sendMessage'
          }, error: ${error})`, () => {
            const parameters = {
              headerFormat,
              error,
              useSendBatch,
              useEachBatch
            };
            return send({
              key: 'someKey',
              value: 'someMessage',
              error,
              useSendBatch,
              useEachBatch
            }).then(() =>
              retry(() =>
                agentControls.getSpans().then(spans => {
                  const httpEntry = verifyHttpEntry(spans);
                  verifyKafkaExits(spans, httpEntry, parameters);
                  verifyFollowUpHttpExit(spans, httpEntry);
                })
              )
            );
          });
        }
      );
    }
  });

  describe('tracing enabled, but trace correlation disabled', function () {
    consumerControls = new ProcessControls({
      appPath: path.join(__dirname, 'consumer'),
      useGlobalAgent: true
    });
    ProcessControls.setUpHooks(consumerControls);

    producerControls = new ProcessControls({
      appPath: path.join(__dirname, 'producer'),
      port: 3216,
      useGlobalAgent: true,
      env: {
        INSTANA_KAFKA_TRACE_CORRELATION: 'false'
      }
    });
    ProcessControls.setUpHooks(producerControls);

    beforeEach(() => resetMessages(consumerControls));
    afterEach(() => resetMessages(consumerControls));

    const nextUseEachBatch = getCircularList([false, true]);

    [false, true].forEach(useSendBatch =>
      registerCorrelationDisabledTestSuite.bind(this)({ useSendBatch, nextUseEachBatch })
    );

    function registerCorrelationDisabledTestSuite({ useSendBatch }) {
      const useEachBatch = nextUseEachBatch();
      it(`must trace sending and receiving but will not keep trace continuity (${
        useSendBatch ? 'sendBatch' : 'sendMessage'
      } => ${useEachBatch ? 'eachBatch' : 'eachMessage'})`, () => {
        const parameters = {
          headerFormat: 'correlation-disabled',
          useSendBatch,
          useEachBatch
        };
        return send({
          key: 'someKey',
          value: 'someMessage',
          useSendBatch,
          useEachBatch
        }).then(() =>
          retry(() =>
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

      it('must not trace Kafka exits when suppressed (but will trace Kafka entries)', () => {
        const parameters = { headerFormat: 'correlation-disabled', useSendBatch, useEachBatch };
        return send({
          key: 'someKey',
          value: 'someMessage',
          useSendBatch,
          useEachBatch,
          suppressTracing: true
        }).then(() =>
          retry(() =>
            getMessages(consumerControls)
              .then(messages => {
                checkMessages(messages, parameters);
                return agentControls.getSpans();
              })
              .then(() => agentControls.getSpans())
              .then(spans => {
                // There should be no HTTP entries and also no Kafka exits.
                expect(getSpansByName(spans, 'node.http.server')).to.be.empty;
                expect(getSpansByName(spans, 'kafka').filter(span => span.k === 2)).to.be.empty;

                // However, since we disabled Kafka trace correlation headers, the suppression flag is not added to
                // Kafka message, thus, each incoming Kafka message will start a new trace with a Kafka entry as its
                // root span.
                verifyKafkaRootEntries(spans, parameters);
              })
          )
        );
      });
    }
  });

  describe('header format from agent config', function () {
    const headerFormat = 'string';
    const customAgentControls = new AgentStubControls();
    customAgentControls.registerTestHooks({
      kafkaConfig: { headerFormat }
    });
    producerControls = new ProcessControls({
      appPath: path.join(__dirname, 'producer'),
      port: 3216,
      agentControls: customAgentControls
    }).registerTestHooks();
    consumerControls = new ProcessControls({
      appPath: path.join(__dirname, 'consumer'),
      agentControls: customAgentControls
    }).registerTestHooks();

    it(
      `must trace sending and receiving and keep trace continuity (header format ${headerFormat} ` +
        'from agent config)',
      () => {
        return send({
          key: 'someKey',
          value: 'someMessage'
        }).then(() =>
          retry(() =>
            getMessages(consumerControls)
              .then(messages => {
                checkMessages(messages, { headerFormat });
                return customAgentControls.getSpans();
              })
              .then(spans => {
                const httpEntry = verifyHttpEntry(spans);
                verifyKafkaExits(spans, httpEntry, { headerFormat });
                verifyFollowUpHttpExit(spans, httpEntry);
              })
          )
        );
      }
    );
  });

  describe('disable trace correlation from agent config', function () {
    const customAgentControls = new AgentStubControls();
    customAgentControls.registerTestHooks({
      kafkaConfig: { traceCorrelation: false }
    });
    producerControls = new ProcessControls({
      appPath: path.join(__dirname, 'producer'),
      port: 3216,
      agentControls: customAgentControls
    }).registerTestHooks();
    consumerControls = new ProcessControls({
      appPath: path.join(__dirname, 'consumer'),
      agentControls: customAgentControls
    }).registerTestHooks();

    const headerFormat = 'correlation-disabled';
    it(
      'must trace sending and receiving but will not keep trace continuity ' +
        '(trace correlation disabled from agent config)',
      () => {
        return send({
          key: 'someKey',
          value: 'someMessage'
        }).then(() =>
          retry(() =>
            getMessages(consumerControls)
              .then(messages => {
                checkMessages(messages, { headerFormat });
                return customAgentControls.getSpans();
              })
              .then(spans => {
                const httpEntry = verifyHttpEntry(spans);
                verifyKafkaExits(spans, httpEntry, { headerFormat });
                verifyFollowUpHttpExit(spans, httpEntry);
              })
          )
        );
      }
    );
  });

  describe('tracing disabled', () => {
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
      const parameters = {
        headerFormat: 'tracing-disabled',
        error: false,
        useSendBatch: false,
        useEachBatch: false
      };

      return send({
        key: 'someKey',
        value: 'someMessage',
        error: false,
        useSendBatch: false,
        useEachBatch: false
      }).then(() =>
        retry(() =>
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
      const message = messages[i];
      msgsPerTopic[message.topic]++;
      expect(message.key).to.equal('someKey');
      expect(message.value).to.equal('someMessage');
      const headerNames = message.headers ? Object.keys(message.headers) : [];
      constants.allInstanaKafkaHeaders.forEach(headerName => expect(headerNames).to.not.contain(headerName));
    }

    expect(msgsPerTopic).to.deep.equal({
      [`${topicPrefix}-1`]: 2,
      [`${topicPrefix}-2`]: useSendBatch ? 1 : 0
    });
  }

  function verifyHttpEntry(spans) {
    return expectAtLeastOneMatching(spans, [
      span => expect(span.n).to.equal('node.http.server'),
      span => expect(span.f.h).to.equal('agent-stub-uuid'),
      span => expect(span.ec).to.equal(0)
    ]);
  }

  function verifyKafkaExits(spans, httpEntry, parameters) {
    const { error, useSendBatch, useEachBatch } = parameters;
    const topicPrefix = getTopicPrefix(useEachBatch);

    const expectedTopics = useSendBatch ? `${topicPrefix}-1,${topicPrefix}-2` : `${topicPrefix}-1`;
    const expectedBatchCount = useSendBatch ? 3 : 2;
    let expectations = [
      span => expect(span.t).to.equal(httpEntry.t),
      span => expect(span.p).to.equal(httpEntry.s),
      span => expect(span.n).to.equal('kafka'),
      span => expect(span.k).to.equal(constants.EXIT),
      span => expect(span.f.h).to.equal('agent-stub-uuid')
    ];
    if (error === 'producer') {
      expectations = expectations.concat([
        span => expect(span.ec).to.equal(1),
        span => expect(span.data.kafka.error).to.contain('Invalid message without value for topic')
      ]);
    } else {
      expectations = expectations.concat([
        span => expect(span.ec).to.equal(0),
        span => expect(span.data.kafka.error).to.not.exist
      ]);
    }

    // We always send 2 messages for topic 1 (also via the normal send method), no matter if useSendBatch is true.
    // With useSendBatch === true, we use a different API which allows sending messages to multiple topics
    // at once (see below).
    expectations = expectations.concat([
      span => expect(span.data.kafka.access).to.equal('send'),
      span => expect(span.data.kafka.service).to.equal(expectedTopics),
      span => expect(span.b).to.deep.equal({ s: expectedBatchCount })
    ]);

    const kafkaExit = expectAtLeastOneMatching(spans, expectations);
    verifyKafkaEntries(spans, kafkaExit, parameters);
  }

  function verifyFollowUpHttpExit(spans, entry) {
    // verify that subsequent calls are correctly traced after creating a kafka entry/exit
    expectAtLeastOneMatching(spans, [
      span => expect(span.n).to.equal('node.http.client'),
      span => expect(span.t).to.equal(entry.t),
      span => expect(span.p).to.equal(entry.s)
    ]);
  }

  function verifyKafkaEntries(spans, parentKafkaExit, parameters) {
    const { headerFormat, error, useSendBatch, useEachBatch } = parameters;
    if (error === 'producer') {
      return;
    }
    const topicPrefix = getTopicPrefix(useEachBatch);
    let expectationsFirstKafkaEntry = [
      span => expect(span.n).to.equal('kafka'),
      span => expect(span.k).to.equal(constants.ENTRY),
      span => expect(span.f.h).to.equal('agent-stub-uuid'),
      span => expect(span.data.kafka.access).to.equal('consume'),
      span => expect(span.data.kafka.service).to.equal(`${topicPrefix}-1`)
    ];
    expectationsFirstKafkaEntry = addParentChildExpectation(expectationsFirstKafkaEntry, parentKafkaExit, headerFormat);
    if (error === 'consumer') {
      expectationsFirstKafkaEntry.push(span => expect(span.ec).to.equal(1));
    } else {
      expectationsFirstKafkaEntry = expectationsFirstKafkaEntry.concat([
        span => expect(span.d).to.be.greaterThan(99),
        span => expect(span.ec).to.equal(0)
      ]);
    }
    if (useEachBatch) {
      expectationsFirstKafkaEntry.push(span => expect(span.b).to.deep.equal({ s: 2 }));
    } else {
      expectationsFirstKafkaEntry.push(span => expect(span.b).to.not.exist);
    }

    const firstKafkaEntry = expectAtLeastOneMatching(spans, expectationsFirstKafkaEntry);
    if (error !== 'consumer') {
      verifyFollowUpHttpExit(spans, firstKafkaEntry);
    }

    if (!useEachBatch) {
      let expectationsSecondKafkaEntry = [
        span => expect(span.n).to.equal('kafka'),
        span => expect(span.s).to.not.equal(firstKafkaEntry.s), // we expect two _different_ entry spans
        span => expect(span.k).to.equal(constants.ENTRY),
        span => expect(span.f.h).to.equal('agent-stub-uuid'),
        span => expect(span.data.kafka.access).to.equal('consume'),
        span => expect(span.data.kafka.service).to.equal(`${topicPrefix}-1`),
        span => expect(span.b).to.not.exist
      ];
      expectationsSecondKafkaEntry = addParentChildExpectation(
        expectationsSecondKafkaEntry,
        parentKafkaExit,
        headerFormat
      );
      if (error === 'consumer') {
        expectationsSecondKafkaEntry.push(span => expect(span.ec).to.equal(1));
      } else {
        expectationsSecondKafkaEntry = expectationsSecondKafkaEntry.concat([
          span => expect(span.d).to.be.greaterThan(99),
          span => expect(span.ec).to.equal(0)
        ]);
      }
      const secondKafkaEntry = expectAtLeastOneMatching(spans, expectationsSecondKafkaEntry);
      if (error !== 'consumer') {
        verifyFollowUpHttpExit(spans, secondKafkaEntry);
      }
    }

    if (useSendBatch) {
      let expectationsThirdKafkaEntry = [
        span => expect(span.n).to.equal('kafka'),
        span => expect(span.k).to.equal(constants.ENTRY),
        span => expect(span.f.h).to.equal('agent-stub-uuid'),
        span => expect(span.data.kafka.access).to.equal('consume'),
        span => expect(span.data.kafka.service).to.equal(`${topicPrefix}-2`)
      ];
      expectationsThirdKafkaEntry = addParentChildExpectation(
        expectationsThirdKafkaEntry,
        parentKafkaExit,
        headerFormat
      );
      if (error === 'consumer') {
        expectationsThirdKafkaEntry.push(span => expect(span.ec).to.equal(1));
      } else {
        expectationsThirdKafkaEntry = expectationsThirdKafkaEntry.concat([
          span => expect(span.d).to.be.greaterThan(99),
          span => expect(span.ec).to.equal(0)
        ]);
      }
      if (useEachBatch) {
        expectationsThirdKafkaEntry.push(span => expect(span.b).to.deep.equal({ s: 1 }));
      } else {
        expectationsThirdKafkaEntry.push(span => expect(span.b).to.not.exist);
      }
      const thirdKafkaEntry = expectAtLeastOneMatching(spans, expectationsThirdKafkaEntry);
      if (error !== 'consumer') {
        verifyFollowUpHttpExit(spans, thirdKafkaEntry);
      }
    }
  }

  function addParentChildExpectation(expectations, parentKafkaExit, headerFormat) {
    if (headerFormat !== 'correlation-disabled') {
      // With correlation headers enabled (default), Kafka entries will be the child span of a Kafka exit.
      expectations = expectations.concat([
        span => expect(span.t).to.equal(parentKafkaExit.t),
        span => expect(span.p).to.equal(parentKafkaExit.s)
      ]);
    } else {
      // With correlation headers disabled every Kafka entry will be the root span of a new trace.
      expectations = expectations.concat([
        span => expect(span.t).to.not.equal(parentKafkaExit.t),
        span => expect(span.p).to.not.exist
      ]);
    }
    return expectations;
  }

  function verifyKafkaRootEntries(spans, parameters) {
    const { useSendBatch, useEachBatch } = parameters;
    const topicPrefix = getTopicPrefix(useEachBatch);
    const expectationsFirstKafkaEntry = [
      span => expect(span.t).to.be.a('string'),
      span => expect(span.p).to.not.exist,
      span => expect(span.n).to.equal('kafka'),
      span => expect(span.k).to.equal(constants.ENTRY),
      span => expect(span.f.h).to.equal('agent-stub-uuid'),
      span => expect(span.data.kafka.access).to.equal('consume'),
      span => expect(span.data.kafka.service).to.equal(`${topicPrefix}-1`),
      span => expect(span.d).to.be.greaterThan(99),
      span => expect(span.ec).to.equal(0)
    ];
    if (useEachBatch) {
      expectationsFirstKafkaEntry.push(span => expect(span.b).to.deep.equal({ s: 2 }));
    } else {
      expectationsFirstKafkaEntry.push(span => expect(span.b).to.not.exist);
    }
    const firstKafkaEntry = expectAtLeastOneMatching(spans, expectationsFirstKafkaEntry);
    verifyFollowUpHttpExit(spans, firstKafkaEntry);

    if (!useEachBatch) {
      const secondKafkaEntry = expectAtLeastOneMatching(spans, [
        span => expect(span.t).to.be.a('string'),
        span => expect(span.p).to.not.exist,
        span => expect(span.n).to.equal('kafka'),
        span => expect(span.s).to.not.equal(firstKafkaEntry.s), // we expect two _different_ entry spans
        span => expect(span.k).to.equal(constants.ENTRY),
        span => expect(span.f.h).to.equal('agent-stub-uuid'),
        span => expect(span.data.kafka.access).to.equal('consume'),
        span => expect(span.data.kafka.service).to.equal(`${topicPrefix}-1`),
        span => expect(span.b).to.not.exist,
        span => expect(span.d).to.be.greaterThan(99),
        span => expect(span.ec).to.equal(0)
      ]);
      verifyFollowUpHttpExit(spans, secondKafkaEntry);

      if (useSendBatch) {
        const expectationsThirdKafkaEntry = [
          span => expect(span.t).to.be.a('string'),
          span => expect(span.p).to.not.exist,
          span => expect(span.n).to.equal('kafka'),
          span => expect(span.k).to.equal(constants.ENTRY),
          span => expect(span.f.h).to.equal('agent-stub-uuid'),
          span => expect(span.data.kafka.access).to.equal('consume'),
          span => expect(span.data.kafka.service).to.equal(`${topicPrefix}-2`),
          span => expect(span.d).to.be.greaterThan(99),
          span => expect(span.ec).to.equal(0)
        ];
        if (useEachBatch) {
          expectationsThirdKafkaEntry.push(span => expect(span.b).to.deep.equal({ s: 1 }));
        } else {
          expectationsThirdKafkaEntry.push(span => expect(span.b).to.not.exist);
        }
        const thirdKafkaEntry = expectAtLeastOneMatching(spans, expectationsThirdKafkaEntry);
        verifyFollowUpHttpExit(spans, thirdKafkaEntry);
      }
    }
  }

  function getTopicPrefix(useEachBatch) {
    return useEachBatch ? 'test-batch-topic' : 'test-topic';
  }
});
