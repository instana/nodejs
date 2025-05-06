/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

/**
 * Important notes
 * ---------------
 *
 * - The Producer as a stream can only have span correlation if the objectMode option is set to true on the
 *   writable stream. Otherwise, there is no way to append the Instana headers to it.
 * - The Producer, as stream or standard API cannot propagate trace correlation headers in format 'binary' and will
 *   always use 'string'. More info here: https://github.com/Blizzard/node-rdkafka/pull/968.
 * - If the option dr_cb is not set to true, we cannot guarantee that a message was sent, but a span with a successful
 *   sent message will be created.
 */

const path = require('path');
const { expect } = require('chai');
const { fail } = expect;
const {
  tracing: { constants }
} = require('@instana/core');

const {
  tracing: { supportedVersion }
} = require('@instana/core');
const config = require('../../../../../core/test/config');
const { expectExactlyOneMatching, retry, delay, stringifyItems } = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');
const { AgentStubControls } = require('../../../apps/agentStubControls');
const { verifyHttpRootEntry, verifyHttpExit } = require('@instana/core/test/test_util/common_verifications');

// TODO: 3.4.0 broke the delivery callback
// const producerEnableDeliveryCbOptions = ['true', 'false'];
const producerEnableDeliveryCbOptions = ['false'];
const producerApiMethods = ['standard', 'stream'];
const consumerApiMethods = ['standard', 'stream'];
const objectModeMethods = ['true', 'false'];
const withErrorMethods = [false, 'bufferErrorSender', 'deliveryErrorSender', 'streamErrorReceiver'];
const RUN_SINGLE_TEST = false;
const SINGLE_TEST_PROPS = {
  producerMethod: 'stream',
  consumerMethod: 'stream',
  objectMode: 'false',
  deliveryCbEnabled: 'true',
  withError: false
};

const retryTime = 1000;
const retryTimeUntil = Date.now() + 20000;
const checkStartedEvery = 3000;
const checkStaredUntil = Date.now() + 60000;
const topic = 'rdkafka-topic';

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/messaging/node-rdkafka', function () {
  this.timeout(config.getTestTimeout() * 20);

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  producerEnableDeliveryCbOptions.forEach(deliveryCbEnabled => {
    objectModeMethods.forEach(objectMode => {
      consumerApiMethods.forEach(consumerMethod => {
        producerApiMethods.forEach(producerMethod => {
          withErrorMethods.forEach(withError => {
            let consumerControls;
            let producerControls;

            // CASE: skip these combination because they do not work or don't make sense
            if (
              (withError === 'deliveryErrorSender' && deliveryCbEnabled === 'false') ||
              (withError === 'deliveryErrorSender' && consumerMethod === 'stream') ||
              (withError === 'deliveryErrorSender' && producerMethod === 'stream') ||
              (withError === 'streamErrorReceiver' && producerMethod === 'standard') ||
              (withError === 'streamErrorReceiver' && consumerMethod === 'standard')
            ) {
              return;
            }

            describe('tracing enabled, no suppression', function () {
              describe(`delivery report: ${deliveryCbEnabled}`, function () {
                describe(`object mode: ${objectMode}`, function () {
                  beforeEach(async () => {
                    consumerControls = new ProcessControls({
                      appPath: path.join(__dirname, 'consumer'),
                      useGlobalAgent: true,
                      env: {
                        RDKAFKA_CONSUMER_AS_STREAM: consumerMethod === 'stream' ? 'true' : 'false',
                        RDKAFKA_CONSUMER_ERROR: withError
                      }
                    });

                    producerControls = new ProcessControls({
                      appPath: path.join(__dirname, 'producer'),
                      useGlobalAgent: true,
                      env: {
                        RDKAFKA_OBJECT_MODE: objectMode,
                        RDKAFKA_PRODUCER_DELIVERY_CB: deliveryCbEnabled === 'true'
                      }
                    });

                    await consumerControls.startAndWaitForAgentConnection(checkStartedEvery, checkStaredUntil);
                    await producerControls.startAndWaitForAgentConnection(checkStartedEvery, checkStaredUntil);
                  });

                  beforeEach(async () => {
                    await agentControls.clearReceivedData();
                  });

                  afterEach(async () => {
                    await consumerControls.stop();
                    await producerControls.stop();

                    consumerControls.clearIpcMessages();
                    producerControls.clearIpcMessages();

                    consumerControls = null;
                    producerControls = null;
                  });

                  if (
                    !RUN_SINGLE_TEST ||
                    (RUN_SINGLE_TEST &&
                      producerMethod === SINGLE_TEST_PROPS.producerMethod &&
                      consumerMethod === SINGLE_TEST_PROPS.consumerMethod &&
                      objectMode === SINGLE_TEST_PROPS.objectMode &&
                      deliveryCbEnabled === SINGLE_TEST_PROPS.deliveryCbEnabled &&
                      withError === SINGLE_TEST_PROPS.withError)
                  ) {
                    it(`produces(${producerMethod}); consumes(${consumerMethod}); error: ${withError}`, async () => {
                      const apiPath = `/produce/${producerMethod}`;

                      let urlWithParams;

                      if (withError === 'deliveryErrorSender') {
                        urlWithParams = `${apiPath}?throwDeliveryErr=true`;
                        await consumerControls.kill();
                      } else if (withError === 'bufferErrorSender') {
                        urlWithParams = `${apiPath}?bufferErrorSender=true`;
                      } else {
                        urlWithParams = apiPath;
                      }

                      let response;

                      if (withError !== 'streamErrorReceiver') {
                        response = await producerControls.sendRequest({
                          method: 'GET',
                          path: urlWithParams
                        });
                      } else {
                        response = {
                          timestamp: Date.now(),
                          wasSent: false,
                          topic,
                          msg: null,
                          messageCounter: 0
                        };
                      }

                      return verify(
                        consumerControls,
                        producerControls,
                        response,
                        apiPath,
                        withError,
                        objectMode,
                        producerMethod
                      );
                    });
                  }
                });
              });
            });
          });
        });
      });
    });
  });

  function verify(_producerControls, _consumerControls, response, apiPath, withError, objectMode, producerMethod) {
    return retry(
      async () => {
        verifyResponseAndMessage(response, _producerControls, withError, objectMode, producerMethod);

        const spans = await agentControls.getSpans();
        return verifySpans(
          _producerControls,
          _consumerControls,
          spans,
          apiPath,
          null,
          withError,
          objectMode,
          producerMethod
        );
      },
      retryTime,
      retryTimeUntil
    );
  }

  function verifySpans(
    receiverControls,
    _senderControls,
    spans,
    apiPath,
    messageId,
    withError,
    objectMode,
    producerMethod
  ) {
    // CASE: We do not even produce a msg for this case
    if (withError === 'streamErrorReceiver') {
      expect(spans.length).to.equal(0);
      return;
    }

    // CASE: producer stream only works with objectMode true
    //       no producer exit span because we use headers and objectMode false does not support it
    if (objectMode === 'false' && producerMethod === 'stream' && !withError) {
      verifyHttpRootEntry({ spans, apiPath, pid: String(_senderControls.getPid()) });
      verifyHttpExit({ spans, parent: null, pid: String(_senderControls.getPid()) });

      expect(spans.length).to.equal(2);
      return;
    }

    const httpEntry = verifyHttpRootEntry({ spans, apiPath, pid: String(_senderControls.getPid()) });
    let kafkaExit;

    // CASE: buffer error means -> we not even produce a kafka msg
    if (withError !== 'bufferErrorSender') {
      kafkaExit = verifyRdKafkaExit(_senderControls, spans, httpEntry, messageId, withError);
      verifyHttpExit({ spans, parent: httpEntry, pid: String(_senderControls.getPid()) });
    }

    // CASE: we do not expect a kafka entry span for errors
    if (!withError) {
      const kafkaEntry = verifyRdKafkaEntry(receiverControls, spans, kafkaExit, messageId, withError);
      verifyHttpExit({ spans, parent: kafkaEntry, pid: String(receiverControls.getPid()) });
    }
  }

  function verifyRdKafkaEntry(receiverControls, spans, parent, messageId, withError, expectedService = topic) {
    return expectExactlyOneMatching(spans, [
      span => expect(span.n).to.equal('kafka'),
      span => expect(span.k).to.equal(constants.ENTRY),
      span => {
        if (parent) {
          expect(span.t).to.equal(parent.t);
        } else {
          expect(span.t).to.be.a('string');
        }
      },
      span => {
        if (parent) {
          expect(span.p).to.equal(parent.s);
        } else {
          expect(span.p).to.not.exist;
        }
      },
      span => expect(span.f.e).to.equal(String(receiverControls.getPid())),
      span => expect(span.f.h).to.equal('agent-stub-uuid'),
      span => {
        if (withError === 'streamErrorReceiver') {
          expect(span.data.kafka.error).to.equal('KafkaConsumer is not connected');
        } else {
          expect(span.data.kafka.error).to.not.exist;
        }
      },
      span => expect(span.ec).to.equal(withError ? 1 : 0),
      span => expect(span.async).to.not.exist,
      span => expect(span.data).to.exist,
      span => expect(span.data.kafka).to.be.an('object'),
      span => expect(span.data.kafka.service).to.equal(expectedService),
      span => expect(span.data.kafka.access).to.equal('consume')
    ]);
  }

  function verifyRdKafkaExit(_senderControls, spans, parent, messageId, withError) {
    return expectExactlyOneMatching(spans, [
      span => expect(span.n).to.equal('kafka'),
      span => expect(span.k).to.equal(constants.EXIT),
      span => expect(span.t).to.equal(parent.t),
      span => expect(span.p).to.equal(parent.s),
      span => expect(span.f.e).to.equal(String(_senderControls.getPid())),
      span => expect(span.f.h).to.equal('agent-stub-uuid'),
      span => expect(span.async).to.not.exist,
      span => expect(span.data).to.exist,
      span => expect(span.data.kafka).to.be.an('object'),
      span => expect(span.data.kafka.service).to.equal(topic),
      span => expect(span.data.kafka.access).to.equal('send'),

      span => expect(span.ec).to.equal(!withError ? 0 : 1),
      span => (!withError ? expect(span.data.kafka.error).to.not.exist : ''),
      span =>
        withError === 'deliveryErrorSender' ? expect(span.data.kafka.error).to.equal('delivery fake error') : '',
      span =>
        withError === 'bufferErrorSender'
          ? expect(span.data.kafka.error).to.equal('Message must be a buffer or null')
          : ''
    ]);
  }

  describe('tracing enabled, header format string', function () {
    this.timeout(config.getTestTimeout() * 10);
    let producerControls;
    let consumerControls;

    before(async () => {
      producerControls = new ProcessControls({
        appPath: path.join(__dirname, 'producer'),
        useGlobalAgent: true
      });
      consumerControls = new ProcessControls({
        appPath: path.join(__dirname, 'consumer'),
        useGlobalAgent: true
      });

      await producerControls.startAndWaitForAgentConnection(checkStartedEvery, checkStaredUntil);
      await consumerControls.startAndWaitForAgentConnection(checkStartedEvery, checkStaredUntil);
    });

    beforeEach(async () => {
      await agentControls.clearReceivedTraceData();
    });

    after(async () => {
      await producerControls.stop();
      await consumerControls.stop();
    });

    afterEach(async () => {
      await producerControls.clearIpcMessages();
      await consumerControls.clearIpcMessages();
    });

    it('must trace sending and receiving and keep trace continuity', async () => {
      const apiPath = '/produce/standard';
      const response = await producerControls.sendRequest({
        method: 'GET',
        path: apiPath
      });

      await retry(
        async () => {
          await verifyResponseAndMessage(response, consumerControls);
          const spans = await agentControls.getSpans();
          const httpEntry = verifyHttpRootEntry({ spans, apiPath, pid: String(producerControls.getPid()) });
          const kafkaExit = verifyRdKafkaExit(producerControls, spans, httpEntry, null, false);
          verifyHttpExit({ spans, parent: httpEntry, pid: String(producerControls.getPid()) });
          const kafkaEntry = verifyRdKafkaEntry(consumerControls, spans, kafkaExit, null, false);
          verifyHttpExit({ spans, parent: kafkaEntry, pid: String(consumerControls.getPid()) });
        },
        retryTime,
        retryTimeUntil
      );
    });
  });

  describe('tracing enabled, header format string via agent config', function () {
    this.timeout(config.getTestTimeout() * 2);

    const customAgentControls = new AgentStubControls();
    let producerControls;
    let consumerControls;

    before(async () => {
      await customAgentControls.startAgent();

      producerControls = new ProcessControls({
        appPath: path.join(__dirname, 'producer'),
        agentControls: customAgentControls
      });
      consumerControls = new ProcessControls({
        appPath: path.join(__dirname, 'consumer'),
        agentControls: customAgentControls
      });

      await producerControls.startAndWaitForAgentConnection(checkStartedEvery, checkStaredUntil);
      await consumerControls.startAndWaitForAgentConnection(checkStartedEvery, checkStaredUntil);
    });

    beforeEach(async () => {
      await customAgentControls.clearReceivedTraceData();
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

    it('must trace sending and receiving but will not keep trace continuity', async () => {
      const apiPath = '/produce/standard';
      const response = await producerControls.sendRequest({
        method: 'GET',
        path: apiPath
      });

      await retry(
        async () => {
          await verifyResponseAndMessage(response, consumerControls);
          const spans = await customAgentControls.getSpans();
          const httpEntry = verifyHttpRootEntry({ spans, apiPath, pid: String(producerControls.getPid()) });
          const kafkaExit = verifyRdKafkaExit(producerControls, spans, httpEntry, null, false);
          verifyHttpExit({ spans, parent: httpEntry, pid: String(producerControls.getPid()) });
          const kafkaEntry = verifyRdKafkaEntry(consumerControls, spans, kafkaExit, null, false);
          verifyHttpExit({ spans, parent: kafkaEntry, pid: String(consumerControls.getPid()) });
        },
        retryTime,
        retryTimeUntil
      );
    });
  });

  describe('tracing enabled, but trace correlation disabled', function () {
    this.timeout(config.getTestTimeout() * 2);

    let producerControls;
    let consumerControls;

    before(async () => {
      producerControls = new ProcessControls({
        appPath: path.join(__dirname, 'producer'),
        useGlobalAgent: true,
        env: {
          INSTANA_KAFKA_TRACE_CORRELATION: 'false'
        }
      });
      consumerControls = new ProcessControls({
        appPath: path.join(__dirname, 'consumer'),
        useGlobalAgent: true
      });

      await producerControls.startAndWaitForAgentConnection(checkStartedEvery, checkStaredUntil);
      await consumerControls.startAndWaitForAgentConnection(checkStartedEvery, checkStaredUntil);
    });

    beforeEach(async () => {
      await agentControls.clearReceivedTraceData();
    });

    after(async () => {
      await producerControls.stop();
      await consumerControls.stop();
    });

    afterEach(async () => {
      await producerControls.clearIpcMessages();
      await consumerControls.clearIpcMessages();
    });

    it('must trace sending and receiving but will not keep trace continuity', async () => {
      const apiPath = '/produce/standard';
      const response = await producerControls.sendRequest({
        method: 'GET',
        path: apiPath
      });

      await retry(
        async () => {
          await verifyResponseAndMessage(response, consumerControls);
          const spans = await agentControls.getSpans();
          const httpEntry = verifyHttpRootEntry({ spans, apiPath, pid: String(producerControls.getPid()) });
          verifyRdKafkaExit(producerControls, spans, httpEntry, null, false);
          verifyHttpExit({ spans, parent: httpEntry, pid: String(producerControls.getPid()) });
          const kafkaEntry = verifyRdKafkaEntry(consumerControls, spans, null, null, false);
          verifyHttpExit({ spans, parent: kafkaEntry, pid: String(consumerControls.getPid()) });
        },
        retryTime,
        retryTimeUntil
      );
    });
  });

  describe('tracing enabled, trace correlation disabled via agent config', function () {
    this.timeout(config.getTestTimeout() * 2);

    const customAgentControls = new AgentStubControls();
    let producerControls;
    let consumerControls;

    before(async () => {
      await customAgentControls.startAgent({
        kafkaConfig: { traceCorrelation: false }
      });

      producerControls = new ProcessControls({
        appPath: path.join(__dirname, 'producer'),
        agentControls: customAgentControls
      });
      consumerControls = new ProcessControls({
        appPath: path.join(__dirname, 'consumer'),
        agentControls: customAgentControls
      });

      await producerControls.startAndWaitForAgentConnection(checkStartedEvery, checkStaredUntil);
      await consumerControls.startAndWaitForAgentConnection(checkStartedEvery, checkStaredUntil);
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

    it('must trace sending and receiving but will not keep trace continuity', async () => {
      const apiPath = '/produce/standard';
      const response = await producerControls.sendRequest({
        method: 'GET',
        path: apiPath
      });

      await retry(
        async () => {
          await verifyResponseAndMessage(response, consumerControls);
          const spans = await customAgentControls.getSpans();
          const httpEntry = verifyHttpRootEntry({ spans, apiPath, pid: String(producerControls.getPid()) });
          verifyRdKafkaExit(producerControls, spans, httpEntry, null, false);
          verifyHttpExit({ spans, parent: httpEntry, pid: String(producerControls.getPid()) });
          const kafkaEntry = verifyRdKafkaEntry(consumerControls, spans, null, null, false);
          verifyHttpExit({ spans, parent: kafkaEntry, pid: String(consumerControls.getPid()) });
        },
        retryTime,
        retryTimeUntil
      );
    });
  });

  describe('tracing disabled', () => {
    this.timeout(config.getTestTimeout() * 2);

    let producerControls;

    before(async () => {
      producerControls = new ProcessControls({
        appPath: path.join(__dirname, 'producer'),
        useGlobalAgent: true,
        tracingEnabled: false,
        env: {
          RDKAFKA_PRODUCER_DELIVERY_CB: 'false'
        }
      });

      await producerControls.startAndWaitForAgentConnection(checkStartedEvery, checkStaredUntil);
    });

    beforeEach(async () => {
      await agentControls.clearReceivedTraceData();
    });

    after(async () => {
      await producerControls.stop();
    });

    afterEach(async () => {
      await producerControls.clearIpcMessages();
    });

    describe('producing and consuming', () => {
      let consumerControls;

      before(async () => {
        consumerControls = new ProcessControls({
          appPath: path.join(__dirname, 'consumer'),
          useGlobalAgent: true,
          tracingEnabled: false,
          env: {
            RDKAFKA_CONSUMER_AS_STREAM: 'false'
          }
        });

        await consumerControls.startAndWaitForAgentConnection(checkStartedEvery, checkStaredUntil);
      });

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });

      after(async () => {
        await consumerControls.stop();
      });

      afterEach(async () => {
        await consumerControls.clearIpcMessages();
      });

      it('should not trace for producing as standard / consuming as standard', async () => {
        const response = await producerControls.sendRequest({
          method: 'GET',
          path: '/produce/standard'
        });

        return retry(() => verifyResponseAndMessage(response, consumerControls), retryTime, retryTimeUntil)
          .then(() => delay(1000))
          .then(() => agentControls.getSpans())
          .then(spans => {
            if (spans.length > 0) {
              fail(`Unexpected spans (rdkafka suppressed: ${stringifyItems(spans)}`);
            }
          });
      });
    });
  });

  describe('tracing enabled but suppressed', () => {
    let producerControls;

    before(async () => {
      producerControls = new ProcessControls({
        appPath: path.join(__dirname, 'producer'),
        useGlobalAgent: true,
        env: {
          RDKAFKA_PRODUCER_DELIVERY_CB: 'false'
        }
      });
      await producerControls.startAndWaitForAgentConnection(checkStartedEvery, checkStaredUntil);
    });

    beforeEach(async () => {
      await agentControls.clearReceivedTraceData();
    });

    after(async () => {
      await producerControls.stop();
    });

    afterEach(async () => {
      await producerControls.clearIpcMessages();
    });

    describe('tracing suppressed', () => {
      let receiverControls;

      before(async () => {
        receiverControls = new ProcessControls({
          appPath: path.join(__dirname, 'consumer'),
          useGlobalAgent: true,
          env: {
            RDKAFKA_CONSUMER_AS_STREAM: 'false'
          }
        });

        await receiverControls.startAndWaitForAgentConnection(checkStartedEvery, checkStaredUntil);
      });

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });

      after(async () => {
        await receiverControls.stop();
      });

      afterEach(async () => {
        await receiverControls.clearIpcMessages();
      });

      it("doesn't trace when producing as standard / consuming as standard", async () => {
        const response = await producerControls.sendRequest({
          method: 'GET',
          path: '/produce/standard',
          suppressTracing: true
        });

        return retry(
          () => {
            verifyResponseAndMessage(response, receiverControls);
          },
          retryTime,
          retryTimeUntil
        )
          .then(() => delay(1000))
          .then(() => agentControls.getSpans())
          .then(spans => {
            if (spans.length > 0) {
              fail(`Unexpected spans (rdkafka suppressed: ${stringifyItems(spans)}`);
            }
          });
      });
    });
  });

  describe('ignore endpoints configuration', () => {
    describe('via agent configuration', () => {
      describe('when ignoring Kafka all methods', () => {
        this.timeout(config.getTestTimeout() * 2);

        const customAgentControls = new AgentStubControls();
        let producerControls;
        let consumerControls;

        before(async () => {
          await customAgentControls.startAgent({
            ignoreEndpoints: { kafka: ['*'] }
          });

          producerControls = new ProcessControls({
            appPath: path.join(__dirname, 'producer'),
            agentControls: customAgentControls
          });
          consumerControls = new ProcessControls({
            appPath: path.join(__dirname, 'consumer'),
            agentControls: customAgentControls
          });

          await producerControls.startAndWaitForAgentConnection(checkStartedEvery, checkStaredUntil);
          await consumerControls.startAndWaitForAgentConnection(checkStartedEvery, checkStaredUntil);
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

        it('should ignore all Kafka spans and downstream calls', async () => {
          const apiPath = '/produce/standard';
          const response = await producerControls.sendRequest({
            method: 'GET',
            path: apiPath
          });

          await retry(
            async () => {
              await verifyResponseAndMessage(response, consumerControls);
              const spans = await customAgentControls.getSpans();
              // 1 x http server
              // 1 x http client
              expect(spans.length).to.equal(2);

              const spanNames = spans.map(span => span.n);
              // Flow: HTTP
              //       ├── Kafka Produce (ignored)
              //       │      └── Kafka Consume → HTTP (ignored)
              //       └── HTTP exit (traced)
              expect(spanNames).to.include('node.http.server');
              expect(spanNames).to.include('node.http.client');

              // Since Kafka produce is ignored, both the produce operation and all downstream calls are also ignored.
              expect(spanNames).to.not.include('kafka');
            },
            retryTime,
            retryTimeUntil
          );
        });
      });
    });
    describe('when ignoring Kafka consume (entry span) is set', () => {
      this.timeout(config.getTestTimeout() * 2);

      const customAgentControls = new AgentStubControls();
      let producerControls;
      let consumerControls;

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

        await producerControls.startAndWaitForAgentConnection(checkStartedEvery, checkStaredUntil);
        await consumerControls.startAndWaitForAgentConnection(checkStartedEvery, checkStaredUntil);
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
        const apiPath = '/produce/standard';
        const response = await producerControls.sendRequest({
          method: 'GET',
          path: apiPath
        });

        await retry(
          async () => {
            await verifyResponseAndMessage(response, consumerControls);
            const spans = await customAgentControls.getSpans();
            expect(spans.length).to.equal(3);

            // Flow: HTTP
            //       ├── Kafka Produce (traced)
            //       │      └── Kafka Consume → HTTP (ignored)
            //       └── HTTP exit (traced)
            // Kafka send will still be present, but since Kafka consume is ignored, the consume operation
            // and all subsequent downstream calls will also be ignored.
            const spanNames = spans.map(span => span.n);
            expect(spanNames).to.include('node.http.server');
            expect(spanNames).to.include('node.http.client');
            expect(spanNames).to.include('kafka');

            // Kafka send exists but consume is ignored
            expect(spans.some(span => span.n === 'kafka' && span.data.kafka?.access === 'send')).to.be.true;
            expect(spans.some(span => span.n === 'kafka' && span.data.kafka?.access === 'consume')).to.be.false;
          },
          retryTime,
          retryTimeUntil
        );
      });
    });
  });
});

function verifyResponseAndMessage(response, consumerControls, withError, objectMode, producerMethod) {
  expect(response).to.be.an('object');
  const receivedMessages = consumerControls.getIpcMessages();
  expect(receivedMessages).to.be.an('array');

  // CASE: we do not expect consumer messages if error on sender side
  // CASE: producer stream does not work with objectMode false
  if (withError || (objectMode === 'false' && producerMethod === 'stream')) {
    expect(receivedMessages.length).to.equal(0);
    return;
  }

  expect(receivedMessages).to.have.lengthOf.at.least(1);
  const message = receivedMessages.filter(({ headers }) => {
    if (!headers) return;

    const header = headers.filter(_header => _header.message_counter != null)[0];

    const messageCounter = Buffer.from(header.message_counter.data).toString();
    return parseInt(messageCounter, 10) === response.messageCounter;
  })[0];

  expect(message).to.exist;
  const messagePayload = Buffer.from(message.value.data, 'utf8').toString();
  expect(messagePayload).to.equal('Node rdkafka is great!');

  const headerNames = [];
  message.headers.forEach(keyValuePair => {
    const key = Object.keys(keyValuePair)[0];
    headerNames.push(key);
  });
  constants.allInstanaKafkaHeaders.forEach(headerName => expect(headerNames).to.not.contain(headerName));

  expect(message.topic).to.equal(topic);
  return message;
}
