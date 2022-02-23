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

const producerEnableDeliveryCbOptions = ['true', 'false'];
const producerApiMethods = ['standard', 'stream'];
const consumerApiMethods = ['standard', 'stream'];

const { getCircularList } = require('@instana/core/test/test_util/circular_list');
const getNextProducerMethod = getCircularList(producerApiMethods);
const getNextConsumerMethod = getCircularList(consumerApiMethods);
const getNextDeliveryCb = getCircularList(producerEnableDeliveryCbOptions);

if (!supportedVersion(process.versions.node)) {
  mochaSuiteFn = describe.skip;
} else {
  mochaSuiteFn = describe;
}
const retryTime = config.getTestTimeout() * 2;

const topic = 'rdkafka-topic';

mochaSuiteFn.only('tracing/messaging/node-rdkafka', function () {
  this.timeout(config.getTestTimeout() * 4);

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  describe('tracing enabled, no suppression', function () {
    const producerControls = new ProcessControls({
      appPath: path.join(__dirname, 'producer'),
      port: 3216,
      useGlobalAgent: true,
      env: {
        RDKAFKA_PRODUCER_DELIVERY_CB: getNextDeliveryCb()
      }
    });

    ProcessControls.setUpHooksWithRetryTime(retryTime, producerControls);

    consumerApiMethods.forEach(consumerMethod => {
      describe(`consuming via ${consumerMethod} API`, () => {
        const consumerControls = new ProcessControls({
          appPath: path.join(__dirname, 'consumer'),
          port: 3215,
          useGlobalAgent: true,
          env: {
            RDKAFKA_CONSUMER_AS_STREAM: consumerMethod === 'stream' ? 'true' : 'false'
          }
        });

        ProcessControls.setUpHooksWithRetryTime(retryTime, consumerControls);

        producerApiMethods.forEach(producerMethod => {
          [false, 'sender'].forEach(withError => {
            const apiPath = `/produce/${producerMethod}`;
            const urlWithParams = withError ? apiPath + '?withError=true' : apiPath;

            it(`produces as ${producerMethod}; consumes as ${consumerMethod}; error: ${!!withError}`, async () => {
              const response = await producerControls.sendRequest({
                method: 'GET',
                path: urlWithParams,
                simple: withError !== 'sender'
              });

              return verify(consumerControls, producerControls, response, apiPath, withError);
            });
          });
        });
      });
    });
  });

  function verify(_producerControls, _consumerControls, response, apiPath, withError) {
    if (withError === 'sender') {
      expect(response.error).to.equal('Message must be a buffer or null');
    } else {
      return retry(() => {
        verifyResponseAndMessage(response, _producerControls);

        return agentControls
          .getSpans()
          .then(spans => verifySpans(_producerControls, _consumerControls, spans, apiPath, null, withError));
      }, retryTime);
    }
  }

  function verifySpans(receiverControls, _senderControls, spans, apiPath, messageId, withError) {
    const httpEntry = verifyHttpRootEntry({ spans, apiPath, pid: String(_senderControls.getPid()) });
    const kafkaExit = verifyRdKafkaExit(_senderControls, spans, httpEntry, messageId, withError);
    verifyHttpExit({ spans, parent: httpEntry, pid: String(_senderControls.getPid()) });

    if (withError !== 'publisher') {
      const kafkaEntry = verifyRdKafkaEntry(receiverControls, spans, kafkaExit, messageId, withError);
      verifyHttpExit({ spans, parent: kafkaEntry, pid: String(receiverControls.getPid()) });
    }
  }

  function verifyRdKafkaEntry(receiverControls, spans, parent, messageId, withError) {
    const operation = expectExactlyOneMatching;

    return operation(spans, [
      span => expect(span.n).to.equal('kafka'),
      span => expect(span.k).to.equal(constants.ENTRY),
      span => expect(span.t).to.equal(parent.t),
      span => expect(span.p).to.equal(parent.s),
      span => expect(span.f.e).to.equal(String(receiverControls.getPid())),
      span => expect(span.f.h).to.equal('agent-stub-uuid'),
      span => {
        if (withError === 'receiver') {
          expect(span.data.kafka.error).to.match(/Forced error/);
        } else {
          expect(span.data.kafka.error).to.not.exist;
        }
      },
      span => expect(span.ec).to.equal(withError === 'receiver' ? 1 : 0),
      span => expect(span.async).to.not.exist,
      span => expect(span.data).to.exist,
      span => expect(span.data.kafka).to.be.an('object'),
      span => expect(span.data.kafka.service).to.equal(topic),
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
      span => expect(span.error).to.not.exist,
      span => expect(span.ec).to.equal(withError === 'sender' ? 1 : 0),
      span => expect(span.async).to.not.exist,
      span => expect(span.data).to.exist,
      span => expect(span.data.kafka).to.be.an('object'),
      span => expect(span.data.kafka.service).to.equal(topic),
      span => expect(span.data.kafka.access).to.equal('send')
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
        RDKAFKA_PRODUCER_DELIVERY_CB: getNextDeliveryCb()
      }
    });

    ProcessControls.setUpHooksWithRetryTime(retryTime, producerControls);

    const receivingMethod = getNextConsumerMethod();
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

      const producerMethod = getNextProducerMethod();
      it(`should not trace for producing as ${producerMethod} / consuming as ${receivingMethod}`, async () => {
        const response = await producerControls.sendRequest({
          method: 'GET',
          path: `/produce/${producerMethod}`
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
        RDKAFKA_PRODUCER_DELIVERY_CB: getNextDeliveryCb()
      }
    });

    ProcessControls.setUpHooksWithRetryTime(retryTime, producerControls);

    const consumerMethod = getNextConsumerMethod();
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

      const producerMethod = getNextProducerMethod();
      it(`doesn't trace when producing as ${producerMethod} / consuming as ${consumerMethod}`, async () => {
        const response = await producerControls.sendRequest({
          method: 'GET',
          path: `/produce/${producerMethod}`,
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

function verifyResponseAndMessage(response, consumerControls) {
  expect(response).to.be.an('object');
  const receivedMessages = consumerControls.getIpcMessages();
  expect(receivedMessages).to.be.an('array');
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
