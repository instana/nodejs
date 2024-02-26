/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const path = require('path');
const semver = require('semver');
const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('@instana/core/test/config');
const {
  delay,
  expectExactlyOneMatching,
  expectAtLeastOneMatching,
  getCircularList,
  getSpansByName,
  retry
} = require('@instana/core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');
const { AgentStubControls } = require('../../../apps/agentStubControls');

const mochaSuiteFn =
  supportedVersion(process.versions.node) && semver.gte(process.versions.node, '14.0.0') ? describe : describe.skip;

mochaSuiteFn('tracing/kafkajs', function () {
  this.timeout(config.getTestTimeout() * 2);

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  describe('tracing enabled ', function () {
    const nextUseEachBatch = getCircularList([false, true]);
    const nextError = getCircularList([false, 'consumer']);

    ['binary', 'string', 'both'].forEach(headerFormat => {
      describe(`header format: ${headerFormat}`, function () {
        [false, true].forEach(useSendBatch => {
          const useEachBatch = nextUseEachBatch();
          const error = nextError();

          describe(
            `kafkajs (header format: ${headerFormat}, ${useSendBatch ? 'sendBatch' : 'sendMessage'} => ` +
              `${useEachBatch ? 'eachBatch' : 'eachMessage'}, error: ${error})`,
            () => {
              let producerControls;
              let consumerControls;

              before(async () => {
                consumerControls = new ProcessControls({
                  appPath: path.join(__dirname, 'consumer'),
                  useGlobalAgent: true
                });

                producerControls = new ProcessControls({
                  appPath: path.join(__dirname, 'producer'),
                  useGlobalAgent: true,
                  env: {
                    INSTANA_KAFKA_HEADER_FORMAT: headerFormat
                  }
                });

                await consumerControls.startAndWaitForAgentConnection();
                await producerControls.startAndWaitForAgentConnection();
              });

              after(async () => {
                await producerControls.stop();
                await consumerControls.stop();
              });

              beforeEach(async () => {
                await resetMessages(consumerControls);
              });

              afterEach(async () => {
                await resetMessages(consumerControls);
              });

              it(`must trace sending and receiving and keep trace continuity (header format: ${headerFormat}, ${
                useSendBatch ? 'sendBatch' : 'sendMessage'
              } => ${useEachBatch ? 'eachBatch' : 'eachMessage'}, error: ${error})`, async () => {
                const parameters = {
                  headerFormat,
                  error,
                  useSendBatch,
                  useEachBatch
                };

                await producerControls.sendRequest({
                  method: 'POST',
                  path: '/send-messages',
                  simple: true,
                  body: JSON.stringify({
                    key: 'someKey',
                    value: 'someMessage',
                    error,
                    useSendBatch,
                    useEachBatch
                  }),
                  headers: {
                    'Content-Type': 'application/json'
                  }
                });

                await retry(async () => {
                  const messages = await getMessages(consumerControls);
                  checkMessages(messages, parameters);
                  const spans = await agentControls.getSpans();
                  const httpEntry = verifyHttpEntry(spans);
                  verifyKafkaExits(spans, httpEntry, parameters);
                  verifyFollowUpHttpExit(spans, httpEntry);
                });
              });

              if (error === false) {
                // we do not need dedicated suppression tests for error conditions
                it(`must not trace when suppressed (header format: ${headerFormat})`, async () => {
                  const parameters = { headerFormat, error, useSendBatch, useEachBatch };

                  await producerControls.sendRequest({
                    method: 'POST',
                    path: '/send-messages',
                    simple: true,
                    suppressTracing: true,
                    body: JSON.stringify({
                      key: 'someKey',
                      value: 'someMessage',
                      error,
                      useSendBatch,
                      useEachBatch
                    }),
                    headers: {
                      'Content-Type': 'application/json'
                    }
                  });

                  await retry(async () => {
                    const messages = await getMessages(consumerControls);
                    checkMessages(messages, parameters);
                    await delay(1000);
                    const spans = await agentControls.getSpans();
                    expect(spans).to.have.lengthOf(0);
                  });
                });
              }
            }
          );
        });
      });
    });
  });

  describe('with error in producer ', function () {
    const headerFormat = 'string';
    const error = 'producer';
    const useEachBatch = false;

    [false, true].forEach(useSendBatch => {
      describe(
        `kafkajs (header format: ${headerFormat}, ${useSendBatch ? 'sendBatch' : 'sendMessage'} => ` +
          `${useEachBatch ? 'eachBatch' : 'eachMessage'}, error: ${error})`,
        () => {
          let producerControls;

          before(async () => {
            producerControls = new ProcessControls({
              appPath: path.join(__dirname, 'producer'),
              useGlobalAgent: true,
              env: {
                INSTANA_KAFKA_HEADER_FORMAT: headerFormat
              }
            });

            await producerControls.startAndWaitForAgentConnection();
          });

          after(async () => {
            await producerControls.stop();
          });

          it(`must trace attempts to send a message when an error happens in the producer (${
            useSendBatch ? 'sendBatch' : 'sendMessage'
          }, error: ${error})`, async () => {
            const parameters = {
              headerFormat,
              error,
              useSendBatch,
              useEachBatch
            };

            await producerControls.sendRequest({
              method: 'POST',
              path: '/send-messages',
              simple: true,
              body: JSON.stringify({
                key: 'someKey',
                value: 'someMessage',
                error,
                useSendBatch,
                useEachBatch
              }),
              headers: {
                'Content-Type': 'application/json'
              }
            });

            await retry(async () => {
              const spans = await agentControls.getSpans();
              const httpEntry = verifyHttpEntry(spans);
              verifyKafkaExits(spans, httpEntry, parameters);
              verifyFollowUpHttpExit(spans, httpEntry);
            });
          });
        }
      );
    });
  });

  describe('tracing enabled, but trace correlation disabled', function () {
    const nextUseEachBatch = getCircularList([false, true]);

    [false, true].forEach(useSendBatch => {
      const useEachBatch = nextUseEachBatch();

      describe(`useEachBatch: ${useEachBatch}, useSendBatch: ${useSendBatch}`, function () {
        let consumerControls;
        let producerControls;

        before(async () => {
          consumerControls = new ProcessControls({
            appPath: path.join(__dirname, 'consumer'),
            useGlobalAgent: true
          });
          producerControls = new ProcessControls({
            appPath: path.join(__dirname, 'producer'),
            useGlobalAgent: true,
            env: {
              INSTANA_KAFKA_TRACE_CORRELATION: 'false'
            }
          });

          await consumerControls.startAndWaitForAgentConnection();
          await producerControls.startAndWaitForAgentConnection();
        });

        after(async () => {
          await producerControls.stop();
          await consumerControls.stop();
        });

        beforeEach(async () => {
          await resetMessages(consumerControls);
        });

        afterEach(async () => {
          await resetMessages(consumerControls);
        });

        it('must trace sending and receiving but will not keep trace continuity', async () => {
          const parameters = {
            headerFormat: 'correlation-disabled',
            useSendBatch,
            useEachBatch
          };

          await producerControls.sendRequest({
            method: 'POST',
            path: '/send-messages',
            simple: true,
            body: JSON.stringify({
              key: 'someKey',
              value: 'someMessage',
              useSendBatch,
              useEachBatch
            }),
            headers: {
              'Content-Type': 'application/json'
            }
          });

          await retry(async () => {
            const messages = await getMessages(consumerControls);
            checkMessages(messages, parameters);
            const spans = await agentControls.getSpans();
            const httpEntry = verifyHttpEntry(spans);
            verifyKafkaExits(spans, httpEntry, parameters);
            verifyFollowUpHttpExit(spans, httpEntry);
          });
        });

        it('must not trace Kafka exits when suppressed (but will trace Kafka entries)', async () => {
          const parameters = { headerFormat: 'correlation-disabled', useSendBatch, useEachBatch };

          await producerControls.sendRequest({
            method: 'POST',
            path: '/send-messages',
            simple: true,
            suppressTracing: true,
            body: JSON.stringify({
              key: 'someKey',
              value: 'someMessage',
              useSendBatch,
              useEachBatch
            }),
            headers: {
              'Content-Type': 'application/json'
            }
          });

          await retry(async () => {
            const messages = await getMessages(consumerControls);
            checkMessages(messages, parameters);
            const spans = await agentControls.getSpans();
            // There should be no HTTP entries and also no Kafka exits.
            expect(getSpansByName(spans, 'node.http.server')).to.be.empty;
            expect(getSpansByName(spans, 'kafka').filter(span => span.k === 2)).to.be.empty;
            // However, since we disabled Kafka trace correlation headers, the suppression flag is not added to
            // Kafka message, thus, each incoming Kafka message will start a new trace with a Kafka entry as its
            // root span.
            verifyKafkaRootEntries(spans, parameters);
          });
        });
      });
    });
  });

  describe('header format from agent config', function () {
    const headerFormat = 'string';
    const customAgentControls = new AgentStubControls();
    let consumerControls;
    let producerControls;

    before(async () => {
      await customAgentControls.startAgent({
        kafkaConfig: { headerFormat }
      });

      consumerControls = new ProcessControls({
        appPath: path.join(__dirname, 'consumer'),
        agentControls: customAgentControls
      });
      producerControls = new ProcessControls({
        appPath: path.join(__dirname, 'producer'),
        agentControls: customAgentControls
      });

      await consumerControls.startAndWaitForAgentConnection();
      await producerControls.startAndWaitForAgentConnection();
    });

    after(async () => {
      await customAgentControls.stopAgent();
      await producerControls.stop();
      await consumerControls.stop();
    });

    it(
      `must trace sending and receiving and keep trace continuity (header format ${headerFormat} ` +
        'from agent config)',
      async () => {
        await producerControls.sendRequest({
          method: 'POST',
          path: '/send-messages',
          simple: true,
          body: JSON.stringify({
            key: 'someKey',
            value: 'someMessage'
          }),
          headers: {
            'Content-Type': 'application/json'
          }
        });

        await retry(async () => {
          const messages = await getMessages(consumerControls);
          checkMessages(messages, { headerFormat });
          const spans = await customAgentControls.getSpans();
          const httpEntry = verifyHttpEntry(spans);
          verifyKafkaExits(spans, httpEntry, { headerFormat });
          verifyFollowUpHttpExit(spans, httpEntry);
        });
      }
    );
  });

  describe('disable trace correlation from agent config', function () {
    const customAgentControls = new AgentStubControls();

    let consumerControls;
    let producerControls;

    before(async () => {
      await customAgentControls.startAgent({
        kafkaConfig: { traceCorrelation: false }
      });

      consumerControls = new ProcessControls({
        appPath: path.join(__dirname, 'consumer'),
        agentControls: customAgentControls
      });
      producerControls = new ProcessControls({
        appPath: path.join(__dirname, 'producer'),
        agentControls: customAgentControls
      });

      await consumerControls.startAndWaitForAgentConnection();
      await producerControls.startAndWaitForAgentConnection();
    });

    after(async () => {
      await customAgentControls.stopAgent();
      await producerControls.stop();
      await consumerControls.stop();
    });

    const headerFormat = 'correlation-disabled';

    it(
      'must trace sending and receiving but will not keep trace continuity ' +
        '(trace correlation disabled from agent config)',
      async () => {
        await producerControls.sendRequest({
          method: 'POST',
          path: '/send-messages',
          simple: true,
          body: JSON.stringify({
            key: 'someKey',
            value: 'someMessage'
          }),
          headers: {
            'Content-Type': 'application/json'
          }
        });

        await retry(async () => {
          const messages = await getMessages(consumerControls);
          checkMessages(messages, { headerFormat });
          const spans = await customAgentControls.getSpans();
          const httpEntry = verifyHttpEntry(spans);
          verifyKafkaExits(spans, httpEntry, { headerFormat });
          verifyFollowUpHttpExit(spans, httpEntry);
        });
      }
    );
  });

  describe('tracing disabled', () => {
    let consumerControls;
    let producerControls;

    before(async () => {
      consumerControls = new ProcessControls({
        appPath: path.join(__dirname, 'consumer'),
        useGlobalAgent: true,
        tracingEnabled: false
      });
      producerControls = new ProcessControls({
        appPath: path.join(__dirname, 'producer'),
        useGlobalAgent: true,
        tracingEnabled: false
      });

      await consumerControls.startAndWaitForAgentConnection();
      await producerControls.startAndWaitForAgentConnection();
    });

    after(async () => {
      await producerControls.stop();
      await consumerControls.stop();
    });

    beforeEach(async () => {
      await resetMessages(consumerControls);
    });

    afterEach(async () => {
      await resetMessages(consumerControls);
    });

    it('must not trace when disabled', async () => {
      const parameters = {
        headerFormat: 'tracing-disabled',
        error: false,
        useSendBatch: false,
        useEachBatch: false
      };

      await producerControls.sendRequest({
        method: 'POST',
        path: '/send-messages',
        simple: true,
        error: false,
        body: JSON.stringify({
          key: 'someKey',
          value: 'someMessage',
          useSendBatch: false,
          useEachBatch: false
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      await retry(async () => {
        const messages = await getMessages(consumerControls);
        checkMessages(messages, parameters);
        await delay(1000);
        const spans = await agentControls.getSpans();
        expect(spans).to.have.lengthOf(0);
      });
    });
  });

  describe('must cope with non-standard length trace and span IDs', () => {
    // regression test for https://github.com/instana/nodejs/issues/833

    let consumerControls;
    let producerControls;

    before(async () => {
      consumerControls = new ProcessControls({
        appPath: path.join(__dirname, 'consumer'),
        useGlobalAgent: true
      });
      producerControls = new ProcessControls({
        appPath: path.join(__dirname, 'producer'),
        useGlobalAgent: true,
        env: {
          INSTANA_KAFKA_HEADER_FORMAT: 'both'
        }
      });

      await consumerControls.startAndWaitForAgentConnection();
      await producerControls.startAndWaitForAgentConnection();
    });

    after(async () => {
      await producerControls.stop();
      await consumerControls.stop();
    });

    beforeEach(async () => {
      await resetMessages(consumerControls);
    });

    afterEach(async () => {
      await resetMessages(consumerControls);
    });

    it('must pad short incoming trace and span IDs', async () => {
      await producerControls.sendRequest({
        method: 'POST',
        path: '/send-messages',
        simple: true,
        body: JSON.stringify({
          key: 'someKey',
          value: 'someMessage'
        }),
        headers: {
          'Content-Type': 'application/json',
          'X-INSTANA-T': '1234',
          'X-INSTANA-S': '5678'
        }
      });

      await retry(async () => {
        const messages = await getMessages(consumerControls);
        checkMessages(messages);
        const spans = await agentControls.getSpans();
        const httpEntry = verifyHttpEntry(spans, {
          traceId: '0000000000001234',
          parentSpanId: '0000000000005678'
        });
        verifyKafkaExits(spans, httpEntry);
        verifyFollowUpHttpExit(spans, httpEntry);
      });
    });
  });

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

  function checkMessages(messages, { error, useSendBatch, useEachBatch } = {}) {
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

  function verifyHttpEntry(spans, { traceId, parentSpanId } = {}) {
    const expectations = [
      span => expect(span.n).to.equal('node.http.server'),
      span => expect(span.f.h).to.equal('agent-stub-uuid'),
      span => expect(span.ec).to.equal(0)
    ];
    if (traceId) {
      expectations.push(span => expect(span.t).to.equal(traceId));
    }
    if (parentSpanId) {
      expectations.push(span => expect(span.p).to.equal(parentSpanId));
    }
    return expectExactlyOneMatching(spans, expectations);
  }

  function verifyKafkaExits(spans, httpEntry, parameters = {}) {
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

    const kafkaExit = expectExactlyOneMatching(spans, expectations);
    verifyKafkaEntries(spans, kafkaExit, parameters);
  }

  function verifyFollowUpHttpExit(spans, entry) {
    // verify that subsequent calls are correctly traced after creating a kafka entry/exit
    expectExactlyOneMatching(spans, [
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
      const secondKafkaEntry = expectExactlyOneMatching(spans, expectationsSecondKafkaEntry);
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
      const thirdKafkaEntry = expectExactlyOneMatching(spans, expectationsThirdKafkaEntry);
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
      const secondKafkaEntry = expectExactlyOneMatching(spans, [
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
        const thirdKafkaEntry = expectExactlyOneMatching(spans, expectationsThirdKafkaEntry);
        verifyFollowUpHttpExit(spans, thirdKafkaEntry);
      }
    }
  }

  function getTopicPrefix(useEachBatch) {
    return useEachBatch ? 'test-batch-topic' : 'test-topic';
  }
});
