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
  expectExactlyOneMatching,
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

  describe('tracing enabled ', function () {
    const nextUseEachBatch = getCircularList([false, true]);
    const nextError = getCircularList([false, 'consumer']);

    [false, true].forEach(useSendBatch => {
      const useEachBatch = nextUseEachBatch();
      const error = nextError();

      describe(
        `kafkajs, ${useSendBatch ? 'sendBatch' : 'sendMessage'} => ` +
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
              useGlobalAgent: true
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

          beforeEach(async () => {
            await resetMessages(consumerControls);
          });

          afterEach(async () => {
            await resetMessages(consumerControls);
          });

          it(`must trace sending and receiving and keep trace continuity, ${
            useSendBatch ? 'sendBatch' : 'sendMessage'
          } => ${useEachBatch ? 'eachBatch' : 'eachMessage'}, error: ${error})`, async () => {
            const parameters = {
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
            it('must not trace when suppressed', async () => {
              const parameters = { error, useSendBatch, useEachBatch };

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

  describe('with error in producer ', function () {
    const error = 'producer';
    const useEachBatch = false;

    [false, true].forEach(useSendBatch => {
      describe(
        `kafkajs, ${useSendBatch ? 'sendBatch' : 'sendMessage'} => ` +
          `${useEachBatch ? 'eachBatch' : 'eachMessage'}, error: ${error})`,
        () => {
          let producerControls;

          before(async () => {
            producerControls = new ProcessControls({
              appPath: path.join(__dirname, 'producer'),
              useGlobalAgent: true
            });

            await producerControls.startAndWaitForAgentConnection();
          });

          beforeEach(async () => {
            await agentControls.clearReceivedTraceData();
          });

          after(async () => {
            await producerControls.stop();
          });

          it(`must trace attempts to send a message when an error happens in the producer (${
            useSendBatch ? 'sendBatch' : 'sendMessage'
          }, error: ${error})`, async () => {
            const parameters = {
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

        beforeEach(async () => {
          await agentControls.clearReceivedTraceData();
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
            kafkaCorrelation: 'correlation-disabled',
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
          const parameters = { kafkaCorrelation: 'correlation-disabled', useSendBatch, useEachBatch };

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

    beforeEach(async () => {
      await customAgentControls.clearReceivedTraceData();
    });

    after(async () => {
      await customAgentControls.stopAgent();
      await producerControls.stop();
      await consumerControls.stop();
    });

    const kafkaCorrelation = 'correlation-disabled';

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
          checkMessages(messages, { kafkaCorrelation });
          const spans = await customAgentControls.getSpans();
          const httpEntry = verifyHttpEntry(spans);
          verifyKafkaExits(spans, httpEntry, { kafkaCorrelation });
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

    beforeEach(async () => {
      await agentControls.clearReceivedTraceData();
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
        kafkaCorrelation: 'tracing-disabled',
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
        useGlobalAgent: true
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
  describe('ignore endpoints configuration', () => {
    let producerControls;
    let consumerControls;

    describe('via agent configuration', () => {
      this.timeout(config.getTestTimeout() * 2);
      const customAgentControls = new AgentStubControls();
      describe('when Kafka produce (send) is ignored', () => {
        before(async () => {
          await customAgentControls.startAgent({ ignoreEndpoints: { kafka: ['send'] } });

          producerControls = new ProcessControls({
            appPath: path.join(__dirname, 'producer'),
            agentControls: customAgentControls
          });
          consumerControls = new ProcessControls({
            appPath: path.join(__dirname, 'consumer'),
            agentControls: customAgentControls
          });

          await producerControls.startAndWaitForAgentConnection();
          await consumerControls.startAndWaitForAgentConnection();
        });

        beforeEach(async () => {
          await agentControls.clearReceivedTraceData();
        });

        after(async () => {
          await customAgentControls.stopAgent();
          await producerControls.stop();
          await consumerControls.stop();
        });

        afterEach(async () => {
          await producerControls.clearIpcMessages();
          await consumerControls.clearIpcMessages();
        });

        it('should ignore Kafka exit spans and downstream calls', async () => {
          await producerControls.sendRequest({
            method: 'POST',
            path: '/send-messages',
            body: JSON.stringify({ key: 'someKey', value: 'someMessage', useSendBatch: false }),
            headers: { 'Content-Type': 'application/json' }
          });

          await retry(async () => {
            const spans = await customAgentControls.getSpans();
            // 1 x http server
            // 1 x http client
            expect(spans.length).to.equal(2);

            // Flow: HTTP(traced)
            //       ├── Kafka Produce (ignored)
            //       │      └── Kafka Consume(ignored) → HTTP (ignored)
            //       └── HTTP exit (traced)
            // Since Kafka produce is ignored, the produce call and all subsequent downstream calls are ignored.
            const spanNames = spans.map(span => span.n);
            expect(spanNames).to.include('node.http.server');
            expect(spanNames).to.include('node.http.client');
            expect(spanNames).to.not.include('kafka');
          });
        });
      });

      describe('when Kafka consume is ignored', () => {
        before(async () => {
          await customAgentControls.startAgent({ ignoreEndpoints: { kafka: ['consume'] } });

          producerControls = new ProcessControls({
            appPath: path.join(__dirname, 'producer'),
            agentControls: customAgentControls
          });
          consumerControls = new ProcessControls({
            appPath: path.join(__dirname, 'consumer'),
            agentControls: customAgentControls
          });

          await producerControls.startAndWaitForAgentConnection();
          await consumerControls.startAndWaitForAgentConnection();
        });

        beforeEach(async () => {
          await agentControls.clearReceivedTraceData();
        });

        after(async () => {
          await customAgentControls.stopAgent();
          await producerControls.stop();
          await consumerControls.stop();
        });

        afterEach(async () => {
          await producerControls.clearIpcMessages();
          await consumerControls.clearIpcMessages();
        });

        it('should ignore Kafka consume and downstream spans but capture kafka send', async () => {
          await producerControls.sendRequest({
            method: 'POST',
            path: '/send-messages',
            body: JSON.stringify({ key: 'someKey', value: 'someMessage', useSendBatch: false }),
            headers: { 'Content-Type': 'application/json' }
          });

          await retry(async () => {
            const spans = await customAgentControls.getSpans();
            // 1 x http server
            // 1 x http client
            // 1 x kafka send
            expect(spans.length).to.equal(3);

            // Flow: HTTP entry
            //       ├── Kafka Produce (traced)
            //       │      └── Kafka Consume → HTTP (ignored)
            //       └── HTTP exit (traced)
            // Kafka send will be captured, since Kafka consume is ignored,
            // the consume call and all its subsequent downstream calls will also be ignored.
            const spanNames = spans.map(span => span.n);
            expect(spanNames).to.include('node.http.server');
            expect(spanNames).to.include('node.http.client');
            expect(spanNames).to.include('kafka');

            // Kafka send exists but consume is ignored
            expect(spans.some(span => span.n === 'kafka' && span.data.kafka?.access === 'send')).to.be.true;
            expect(spans.some(span => span.n === 'kafka' && span.data.kafka?.access === 'consume')).to.be.false;
          });
        });
      });

      describe('when all Kafka topics are ignored', () => {
        before(async () => {
          await customAgentControls.startAgent({ ignoreEndpoints: { kafka: [{ endpoints: ['*'] }] } });

          producerControls = new ProcessControls({
            appPath: path.join(__dirname, 'producer'),
            agentControls: customAgentControls
          });
          consumerControls = new ProcessControls({
            appPath: path.join(__dirname, 'consumer'),
            agentControls: customAgentControls
          });

          await producerControls.startAndWaitForAgentConnection();
          await consumerControls.startAndWaitForAgentConnection();
        });

        beforeEach(async () => {
          await agentControls.clearReceivedTraceData();
        });

        after(async () => {
          await customAgentControls.stopAgent();
          await producerControls.stop();
          await consumerControls.stop();
        });

        afterEach(async () => {
          await producerControls.clearIpcMessages();
          await consumerControls.clearIpcMessages();
        });

        it('should ignore all Kafka traces and downstream calls', async () => {
          await producerControls.sendRequest({
            method: 'POST',
            path: '/send-messages',
            body: JSON.stringify({ key: 'someKey', value: 'someMessage', useSendBatch: true }),
            headers: { 'Content-Type': 'application/json' }
          });

          await retry(async () => {
            const spans = await customAgentControls.getSpans();
            // 1 x http server
            // 1 x http client
            expect(spans.length).to.equal(2);

            // Flow: HTTP
            //       ├── Kafka Produce (ignored)
            //       │      └── Kafka Consume → HTTP (ignored)
            //       └── HTTP exit (traced)
            const spanNames = spans.map(span => span.n);
            expect(spanNames).to.include('node.http.server');
            expect(spanNames).to.include('node.http.client');
            expect(spanNames).to.not.include('kafka');
          });
        });
      });

      describe('when kafka messages produced via sendBatch (batching)', () => {
        describe('when not all topics in sendBatch are listed in the ignore config', () => {
          before(async () => {
            await customAgentControls.startAgent({
              ignoreEndpoints: { kafka: [{ methods: ['send'], endpoints: ['test-topic-2'] }] }
            });

            producerControls = new ProcessControls({
              appPath: path.join(__dirname, 'producer'),
              agentControls: customAgentControls
            });
            consumerControls = new ProcessControls({
              appPath: path.join(__dirname, 'consumer'),
              agentControls: customAgentControls
            });

            await producerControls.startAndWaitForAgentConnection();
            await consumerControls.startAndWaitForAgentConnection();
          });

          beforeEach(async () => {
            await agentControls.clearReceivedTraceData();
          });

          after(async () => {
            await customAgentControls.stopAgent();
            await producerControls.stop();
            await consumerControls.stop();
          });

          afterEach(async () => {
            await producerControls.clearIpcMessages();
            await consumerControls.clearIpcMessages();
          });

          it('should not ignore the sendBatch call and its downstream calls', async () => {
            await producerControls.sendRequest({
              method: 'POST',
              path: '/send-messages',
              body: JSON.stringify({ key: 'someKey', value: 'someMessage', useSendBatch: true }),
              headers: { 'Content-Type': 'application/json' }
            });

            await retry(async () => {
              const spans = await customAgentControls.getSpans();

              // 1 x Kafka sendBatch (kafka:send)
              // 1 x HTTP server request (/send-messages)
              // 4 x HTTP client requests (3 from consumers, 1 from producer)
              // 3 x Kafka consumes (test-topic-1: 2 messages, test-topic-2: 1 message)
              expect(spans.length).to.equal(9);

              // Flow:
              // HTTP request
              //         ├── Kafka Produce (sendBatch) (traced)
              //         │       └── 3 x Kafka Consume  (traced) → 3 x HTTP (from consumers)  (traced)
              //         └── HTTP exit  (traced)
              const spanNames = spans.map(span => span.n);
              expect(spanNames).to.include('node.http.server');
              expect(spanNames).to.include('node.http.client');
              expect(spanNames).to.include('kafka');

              const kafkaSpans = spans.filter(span => span.n === 'kafka');
              expect(kafkaSpans).to.have.lengthOf(4); // 1 send, 3 consume

              const kafkaSendSpan = kafkaSpans.find(span => span.data.kafka.access === 'send');
              expect(kafkaSendSpan).to.exist;
              expect(kafkaSendSpan.data.kafka.service).to.include('test-topic-1');
              expect(kafkaSendSpan.data.kafka.service).to.include('test-topic-2');

              const kafkaConsumeSpans = kafkaSpans.filter(span => span.data.kafka.access === 'consume');
              expect(kafkaConsumeSpans).to.have.lengthOf(3);

              const consumedTopics = kafkaConsumeSpans.map(span => span.data.kafka.service);
              expect(consumedTopics).to.include('test-topic-1');
              expect(consumedTopics).to.include('test-topic-2');
            });
          });
        });

        describe('when all topics in sendBatch are listed in the ignore config', () => {
          before(async () => {
            await customAgentControls.startAgent({
              ignoreEndpoints: {
                kafka: [{ methods: ['send'], endpoints: ['test-topic-1', 'test-topic-2'] }]
              }
            });

            producerControls = new ProcessControls({
              appPath: path.join(__dirname, 'producer'),
              agentControls: customAgentControls
            });
            consumerControls = new ProcessControls({
              appPath: path.join(__dirname, 'consumer'),
              agentControls: customAgentControls
            });

            await producerControls.startAndWaitForAgentConnection();
            await consumerControls.startAndWaitForAgentConnection();
          });

          beforeEach(async () => {
            await agentControls.clearReceivedTraceData();
          });

          after(async () => {
            await customAgentControls.stopAgent();
            await producerControls.stop();
            await consumerControls.stop();
          });

          afterEach(async () => {
            await producerControls.clearIpcMessages();
            await consumerControls.clearIpcMessages();
          });

          it('should ignore the sendBatch call and its downstream calls', async () => {
            await producerControls.sendRequest({
              method: 'POST',
              path: '/send-messages',
              body: JSON.stringify({ key: 'someKey', value: 'someMessage', useSendBatch: true }),
              headers: { 'Content-Type': 'application/json' }
            });

            await retry(async () => {
              const spans = await customAgentControls.getSpans();

              // 1 x HTTP server request (/send-messages)
              // 1 x HTTP client request (from producer)
              // Kafka sendBatch and all consumer traces should be ignored.
              expect(spans.length).to.equal(2);

              // Flow:
              // HTTP request(traced)
              //        ├── Kafka Produce (sendBatch) (ignored)
              //        │       └── 3 x Kafka Consume(ignored) → 3 x HTTP (ignored, from consumers)
              //        └── HTTP exit(traced)
              const spanNames = spans.map(span => span.n);
              expect(spanNames).to.include('node.http.server');
              expect(spanNames).to.include('node.http.client');
              expect(spanNames).to.not.include('kafka');
            });
          });
        });
      });
    });

    describe('via INSTANA_IGNORE_ENDPOINTS_PATH', () => {
      before(async () => {
        consumerControls = new ProcessControls({
          appPath: path.join(__dirname, 'consumer'),
          useGlobalAgent: true,
          env: { INSTANA_IGNORE_ENDPOINTS_PATH: path.join(__dirname, 'files', 'tracing.yaml') }
        });

        producerControls = new ProcessControls({
          appPath: path.join(__dirname, 'producer'),
          useGlobalAgent: true,
          env: { INSTANA_IGNORE_ENDPOINTS_PATH: path.join(__dirname, 'files', 'tracing.yaml') }
        });

        await Promise.all([
          consumerControls.startAndWaitForAgentConnection(),
          producerControls.startAndWaitForAgentConnection()
        ]);
      });

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
        await resetMessages(consumerControls);
      });

      afterEach(async () => {
        await resetMessages(consumerControls);
        await agentControls.clearReceivedTraceData();
      });

      after(async () => {
        await Promise.all([producerControls.stop(), consumerControls.stop()]);
      });

      it('should ignore traces based on configuration file', async () => {
        await producerControls.sendRequest({
          method: 'POST',
          path: '/send-messages',
          body: JSON.stringify({ key: 'someKey', value: 'someMessage', useSendBatch: true }),
          headers: { 'Content-Type': 'application/json' }
        });

        await retry(async () => {
          const spans = await agentControls.getSpans();
          expect(spans.length).to.equal(2);

          const spanNames = spans.map(span => span.n);
          expect(spanNames).to.include('node.http.server');
          expect(spanNames).to.include('node.http.client');
          expect(spanNames).to.not.include('kafka');
        });
      });
    });

    // Special test case for SDK, we need to test the presence of ignored span in consume call.
    describe('SDK: ignore entry spans(consume)', function () {
      before(async () => {
        consumerControls = new ProcessControls({
          appPath: path.join(__dirname, 'consumer'),
          useGlobalAgent: true,
          env: {
            // basic ignoring config for consume
            INSTANA_IGNORE_ENDPOINTS: 'kafka:consume'
          }
        });

        producerControls = new ProcessControls({
          appPath: path.join(__dirname, 'producer'),
          useGlobalAgent: true
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

      it('should ignore consumer call and expose ignored span via instana.currentSpan()', async () => {
        const message = {
          key: 'someKey',
          value: 'someMessage'
        };
        await producerControls.sendRequest({
          method: 'POST',
          path: '/send-messages',
          simple: true,
          body: JSON.stringify(message),
          headers: {
            'Content-Type': 'application/json'
          }
        });

        await retry(async () => {
          // Fetch the current span from the consumer
          const currentSpans = await consumerControls.sendRequest({
            method: 'GET',
            path: '/current-span',
            simple: true,
            suppressTracing: true // no need to trace this call
          });

          expect(currentSpans).to.be.an('array').that.is.not.empty;
          currentSpans.forEach(currentSpan => {
            // The currentSpan contains an InstanaIgnoredSpan, which represents a span that has been ignored
            // due to the configured `INSTANA_IGNORE_ENDPOINTS` setting (`kafka:consume` in this case).
            // Even though the consumer processes the message, its span is not recorded in the agent’s collected spans.
            // However, it can still be accessed via `instana.currentSpan()`, which returns an `InstanaIgnoredSpan`.
            expect(currentSpan).to.have.property('spanConstructorName', 'InstanaIgnoredSpan');
            expect(currentSpan.span).to.exist;
            expect(currentSpan.span).to.include({
              n: 'kafka',
              k: 1
            });
            expect(currentSpan.span.data.kafka).to.include({
              endpoints: 'test-topic-1',
              operation: 'consume'
            });
          });

          const spans = await agentControls.getSpans();

          // 1 x HTTP server
          // 1 x HTTP client
          // 1 x Kafka send span (producer)
          expect(spans).to.have.lengthOf(3);

          // Flow: HTTP entry
          //       ├── Kafka Produce (traced)
          //       │      └── Kafka Consume → HTTP (ignored)
          //       └── HTTP exit (traced)
          const kafkaProducerSpan = spans.find(span => span.n === 'kafka' && span.k === 2);
          const producerHttpSpan = spans.find(span => span.n === 'node.http.server' && span.k === 1);
          const producerHttpExitSpan = spans.find(span => span.n === 'node.http.client' && span.k === 2);

          expect(kafkaProducerSpan).to.exist;
          expect(kafkaProducerSpan.data.kafka).to.include({
            service: 'test-topic-1',
            access: 'send'
          });
          expect(producerHttpSpan).to.exist;
          expect(producerHttpExitSpan).to.exist;
        });
      });
    });

    describe('when consumer having an aditional HTTP entry call', function () {
      before(async () => {
        consumerControls = new ProcessControls({
          appPath: path.join(__dirname, 'consumer'),
          useGlobalAgent: true,
          env: {
            // basic ignoring config for consume
            INSTANA_IGNORE_ENDPOINTS: 'kafka:consume'
          }
        });

        producerControls = new ProcessControls({
          appPath: path.join(__dirname, 'producer'),
          useGlobalAgent: true
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

      it('should not ignore the HTTP entry in consumer while ignoring Kafka consume calls', async () => {
        const message = {
          key: 'someKey',
          value: 'someMessage'
        };
        await producerControls.sendRequest({
          method: 'POST',
          path: '/send-messages',
          simple: true,
          body: JSON.stringify(message),
          headers: {
            'Content-Type': 'application/json'
          }
        });

        await consumerControls.sendRequest({
          method: 'GET',
          path: '/health',
          simple: true
        });

        await delay(200);
        await retry(async () => {
          const spans = await agentControls.getSpans();
          // 2 x HTTP server (1 x consumer, 1 x producer)
          // 1 x HTTP client (producer)
          // 1 x Kafka send span (producer)
          expect(spans).to.have.lengthOf(4);

          // Flow: HTTP entry (producer) (traced)
          //       ├── Kafka Produce (traced)
          //       │      └── Kafka Consume → HTTP (ignored)
          //       └── HTTP exit (traced)
          //
          //      HTTP entry (consumer) (traced)
          const kafkaProducerSpan = spans.find(span => span.n === 'kafka' && span.k === 2);
          const producerHttpSpan = spans.find(
            span => span.n === 'node.http.server' && span.k === 1 && span.data.http.url === '/send-messages'
          );
          const producerHttpExitSpan = spans.find(span => span.n === 'node.http.client' && span.k === 2);
          const consumerHttpSpan = spans.find(
            span => span.n === 'node.http.server' && span.k === 1 && span.data.http.url === '/health'
          );

          expect(kafkaProducerSpan).to.exist;
          expect(kafkaProducerSpan.data.kafka).to.include({
            service: 'test-topic-1',
            access: 'send'
          });
          expect(producerHttpSpan).to.exist;
          expect(producerHttpExitSpan).to.exist;
          expect(consumerHttpSpan).to.exist;
        });
      });
    });

    describe('when downstream suppression is disabled via INSTANA_DISABLE_SUPRESSION', function () {
      before(async () => {
        consumerControls = new ProcessControls({
          appPath: path.join(__dirname, 'consumer'),
          useGlobalAgent: true,
          env: {
            // basic ignoring config for send
            INSTANA_IGNORE_ENDPOINTS: 'kafka:send',
            INSTANA_DISABLE_SUPRESSION: true
          }
        });

        producerControls = new ProcessControls({
          appPath: path.join(__dirname, 'producer'),
          useGlobalAgent: true
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

      it('should ignore only the kafka call send and should trace downstream calls', async () => {
        const message = {
          key: 'someKey',
          value: 'someMessage'
        };
        await producerControls.sendRequest({
          method: 'POST',
          path: '/send-messages',
          simple: true,
          body: JSON.stringify(message),
          headers: {
            'Content-Type': 'application/json'
          }
        });

        await consumerControls.sendRequest({
          method: 'GET',
          path: '/health',
          simple: true
        });

        await delay(200);
        await retry(async () => {
          const spans = await agentControls.getSpans();
          // 2 x HTTP server (1 x consumer, 1 x producer)
          // 4 x HTTP client (1 producer)(2 consumer)
          // 2 x Kafka consume span (consumer)
          expect(spans).to.have.lengthOf(8);

          // Flow: HTTP entry (producer) (traced)
          //       ├── Kafka Produce (traced)
          //       │      └── Kafka Consume → HTTP (ignored)
          //       └── HTTP exit (traced)
          //
          //      HTTP entry (consumer) (traced)
          const kafkaProducerSpan = spans.find(span => span.n === 'kafka' && span.k === 2);
          const producerHttpSpan = spans.find(
            span => span.n === 'node.http.server' && span.k === 1 && span.data.http.url === '/send-messages'
          );
          const producerHttpExitSpan = spans.find(span => span.n === 'node.http.client' && span.k === 2);
          const consumerHttpSpan = spans.find(
            span => span.n === 'node.http.server' && span.k === 1 && span.data.http.url === '/health'
          );

          expect(kafkaProducerSpan).to.exist;
          expect(kafkaProducerSpan.data.kafka).to.include({
            service: 'test-topic-1',
            access: 'send'
          });
          expect(producerHttpSpan).to.exist;
          expect(producerHttpExitSpan).to.exist;
          expect(consumerHttpSpan).to.exist;
        });
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
    const { kafkaCorrelation, error, useSendBatch, useEachBatch } = parameters;
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
    expectationsFirstKafkaEntry = addParentChildExpectation(
      expectationsFirstKafkaEntry,
      parentKafkaExit,
      kafkaCorrelation
    );
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
        kafkaCorrelation
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
        kafkaCorrelation
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

  function addParentChildExpectation(expectations, parentKafkaExit, kafkaCorrelation) {
    if (kafkaCorrelation !== 'correlation-disabled') {
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
