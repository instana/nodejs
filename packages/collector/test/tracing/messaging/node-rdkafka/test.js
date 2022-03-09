/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

/**
 * Important notes
 * ---------------
 *
 * * The Producer as a stream can only have span correlation if the Writtable option objectMode is set to true.
 * Otherwise, there is no way to append the Instana headers to it.
 * * The Producer, as stream or standard API cannot propagate span correlation when headerFormat is set to 'binary'.
 * More info here: https://github.com/Blizzard/node-rdkafka/pull/935.
 * * If the option dr_cb is not set to true, we cannot guarantee that a message was sent, but a span with a successful
 * sent message will be created.
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
const { verifyHttpRootEntry, verifyHttpExit } = require('@instana/core/test/test_util/common_verifications');

let mochaSuiteFn;
const RUN_SINGLE_TEST = false;

const producerEnableDeliveryCbOptions = ['true', 'false'];
const producerApiMethods = ['standard', 'stream'];
const consumerApiMethods = ['standard', 'stream'];
const objectModeMethods = ['true', 'false'];
const withErrorMethods = [false, 'bufferErrorSender', 'deliveryErrorSender', 'streamErrorReceiver'];

if (!supportedVersion(process.versions.node)) {
  mochaSuiteFn = describe.skip;
} else {
  mochaSuiteFn = describe;
}

const retryTime = config.getTestTimeout() * 2;
const topic = 'rdkafka-topic';

mochaSuiteFn('tracing/messaging/node-rdkafka', function () {
  this.timeout(config.getTestTimeout() * 4);

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
                      port: 3215,
                      useGlobalAgent: true,
                      env: {
                        RDKAFKA_CONSUMER_AS_STREAM: consumerMethod === 'stream' ? 'true' : 'false',
                        RDKAFKA_CONSUMER_ERROR: withError
                      }
                    });

                    producerControls = new ProcessControls({
                      appPath: path.join(__dirname, 'producer'),
                      port: 3216,
                      useGlobalAgent: true,
                      env: {
                        RDKAFKA_OBJECT_MODE: objectMode,
                        RDKAFKA_PRODUCER_DELIVERY_CB: deliveryCbEnabled === 'true'
                      }
                    });

                    await consumerControls.startAndWaitForAgentConnection();
                    await producerControls.startAndWaitForAgentConnection();
                  });

                  afterEach(async () => {
                    await consumerControls.stop();
                    await producerControls.stop();

                    consumerControls.clearIpcMessages();
                    producerControls.clearIpcMessages();

                    consumerControls = null;
                    producerControls = null;
                  });

                  // NOTE: this condition helps to test a single use case locally
                  if (
                    RUN_SINGLE_TEST &&
                    producerMethod !== 'standard' &&
                    consumerMethod !== 'standard' &&
                    deliveryCbEnabled !== 'true' &&
                    objectMode !== 'true' &&
                    withError
                  ) {
                    return;
                  }

                  it(`produces(${producerMethod}); consumes(${consumerMethod}); error: ${withError}`, async () => {
                    const apiPath = `/produce/${producerMethod}`;

                    let urlWithParams;

                    if (withError === 'deliveryErrorSender') {
                      urlWithParams = apiPath + '?throwDeliveryErr=true';
                      await consumerControls.kill();
                    } else if (withError === 'bufferErrorSender') {
                      urlWithParams = apiPath + '?bufferErrorSender=true';
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
                });
              });
            });
          });
        });
      });
    });
  });

  function verify(_producerControls, _consumerControls, response, apiPath, withError, objectMode, producerMethod) {
    return retry(() => {
      verifyResponseAndMessage(response, _producerControls, withError, objectMode, producerMethod);

      return agentControls
        .getSpans()
        .then(spans =>
          verifySpans(_producerControls, _consumerControls, spans, apiPath, null, withError, objectMode, producerMethod)
        );
    }, retryTime);
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
    // CASE: Consumer error entry span has no parent
    // CASE: consumer error means -> we not even produce a kafka msg
    if (withError === 'streamErrorReceiver') {
      verifyRdKafkaEntry(receiverControls, spans, null, messageId, withError);
      expect(spans.length).to.equal(1);
      return;
    }

    // CASE: producer stream only works with objectMode true
    //       no producer exit span because we use headers and objectMode false does not support it
    if (objectMode === 'false' && producerMethod === 'stream' && !withError) {
      verifyHttpRootEntry({ spans, apiPath, pid: String(_senderControls.getPid()) });
      expect(spans.length).to.equal(1);
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

  function verifyRdKafkaEntry(receiverControls, spans, parent, messageId, withError) {
    const operation = expectExactlyOneMatching;

    return operation(spans, [
      span => expect(span.n).to.equal('kafka'),
      span => expect(span.k).to.equal(constants.ENTRY),
      span => (parent ? expect(span.t).to.equal(parent.t) : ''),
      span => (parent ? expect(span.p).to.equal(parent.s) : ''),
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
      span =>
        parent ? expect(span.data.kafka.service).to.equal(topic) : expect(span.data.kafka.service).to.equal('empty'),
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

  describe('tracing disabled', () => {
    this.timeout(config.getTestTimeout() * 2);

    const producerControls = new ProcessControls({
      appPath: path.join(__dirname, 'producer'),
      port: 3216,
      useGlobalAgent: true,
      tracingEnabled: false,
      env: {
        RDKAFKA_PRODUCER_DELIVERY_CB: 'false'
      }
    });

    ProcessControls.setUpHooksWithRetryTime(retryTime, producerControls);

    describe('producing and consuming', () => {
      const consumerControls = new ProcessControls({
        appPath: path.join(__dirname, 'consumer'),
        port: 3215,
        useGlobalAgent: true,
        tracingEnabled: false,
        env: {
          RDKAFKA_CONSUMER_AS_STREAM: 'false'
        }
      });

      ProcessControls.setUpHooksWithRetryTime(retryTime, consumerControls);

      it('should not trace for producing as standard / consuming as standard', async () => {
        const response = await producerControls.sendRequest({
          method: 'GET',
          path: '/produce/standard'
        });

        return retry(() => verifyResponseAndMessage(response, consumerControls), retryTime)
          .then(() => delay(config.getTestTimeout() / 4))
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
    const producerControls = new ProcessControls({
      appPath: path.join(__dirname, 'producer'),
      port: 3216,
      useGlobalAgent: true,
      env: {
        RDKAFKA_PRODUCER_DELIVERY_CB: 'false'
      }
    });

    ProcessControls.setUpHooksWithRetryTime(retryTime, producerControls);

    describe('tracing suppressed', () => {
      const receiverControls = new ProcessControls({
        appPath: path.join(__dirname, 'consumer'),
        port: 3215,
        useGlobalAgent: true,
        env: {
          RDKAFKA_CONSUMER_AS_STREAM: 'false'
        }
      });

      ProcessControls.setUpHooksWithRetryTime(retryTime, receiverControls);

      it("doesn't trace when producing as standard / consuming as standard", async () => {
        const response = await producerControls.sendRequest({
          method: 'GET',
          path: '/produce/standard',
          suppressTracing: true
        });

        return retry(() => {
          verifyResponseAndMessage(response, receiverControls);
        }, retryTime)
          .then(() => delay(config.getTestTimeout() / 4))
          .then(() => agentControls.getSpans())
          .then(spans => {
            if (spans.length > 0) {
              fail(`Unexpected spans (rdkafka suppressed: ${stringifyItems(spans)}`);
            }
          });
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
    const header = headers.filter(_header => {
      return _header.message_counter != null;
    })[0];

    const messageCounter = Buffer.from(header.message_counter.data).toString();
    return parseInt(messageCounter, 10) === response.messageCounter;
  })[0];

  expect(message).to.exist;
  expect(Buffer.from(message.value.data, 'utf8').toString()).to.equal('Node rdkafka is great!');
  expect(message.topic).to.equal(topic);
  return message;
}
