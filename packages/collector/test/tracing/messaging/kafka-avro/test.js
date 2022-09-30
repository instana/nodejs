/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

/**
 * Important notes
 * ---------------
 *
 * - Kafka Avro is instrumented through node-rdkafka, which is the API underneath Kafka Avro
 * - Kafka Avro currently works only in Node 14 and below, as it depends on an older version of node-rdkafka with
 *   native modules.
 * - The Producer as a stream can only have trace correlation if the objectMode option is set to true on the
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

const semver = require('semver');
const config = require('../../../../../core/test/config');
const { expectExactlyOneMatching, retry, delay, stringifyItems } = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');
const { verifyHttpRootEntry, verifyHttpExit } = require('@instana/core/test/test_util/common_verifications');

let mochaSuiteFn;

/**
 * See https://github.com/waldophotos/kafka-avro/issues/113
 *
 * Installing kafka-avro via optionalDependencies throws an error,
 * see https://github.com/instana/nodejs/pull/486#discussion_r818509109
 */
const kafkaAvroAllowedVersions = semver.lt(process.versions.node, '16.0.0');

if (!supportedVersion(process.versions.node) || !kafkaAvroAllowedVersions) {
  mochaSuiteFn = describe.skip;
} else {
  mochaSuiteFn = describe;
}

const retryTime = config.getTestTimeout() * 2;
const topic = 'kafka-avro-topic';

mochaSuiteFn('tracing/messaging/kafka-avro', function () {
  this.timeout(1000 * 180);

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  describe('tracing enabled, no suppression', function () {
    const producerControls = new ProcessControls({
      appPath: path.join(__dirname, 'producer'),
      port: 3216,
      useGlobalAgent: true
    });

    ProcessControls.setUpHooksWithRetryTime(retryTime, producerControls);

    describe('consuming message', () => {
      const consumerControls = new ProcessControls({
        appPath: path.join(__dirname, 'consumer'),
        port: 3215,
        useGlobalAgent: true
      });

      ProcessControls.setUpHooksWithRetryTime(retryTime, consumerControls);

      const apiPath = '/produce';

      it('produces and consumes a message', async () => {
        const response = await producerControls.sendRequest({
          method: 'GET',
          path: apiPath
        });

        return verify(consumerControls, producerControls, response, apiPath);
      });
    });
  });

  function verify(_producerControls, _consumerControls, response, apiPath) {
    return retry(() => {
      verifyResponseAndMessage(response, _producerControls);

      return agentControls.getSpans().then(spans => verifySpans(_producerControls, _consumerControls, spans, apiPath));
    }, retryTime);
  }

  function verifySpans(receiverControls, _senderControls, spans, apiPath) {
    const httpEntry = verifyHttpRootEntry({ spans, apiPath, pid: String(_senderControls.getPid()) });
    const kafkaExit = verifyKafkaAvroExit(_senderControls, spans, httpEntry);
    verifyHttpExit({ spans, parent: httpEntry, pid: String(_senderControls.getPid()) });
    const kafkaEntry = verifyKafkaAvroEntry(receiverControls, spans, kafkaExit);
    verifyHttpExit({ spans, parent: kafkaEntry, pid: String(receiverControls.getPid()) });
  }

  function verifyKafkaAvroEntry(receiverControls, spans, parent) {
    const operation = expectExactlyOneMatching;

    return operation(spans, [
      span => expect(span.n).to.equal('kafka'),
      span => expect(span.k).to.equal(constants.ENTRY),
      span => expect(span.t).to.equal(parent.t),
      span => expect(span.p).to.equal(parent.s),
      span => expect(span.f.e).to.equal(String(receiverControls.getPid())),
      span => expect(span.f.h).to.equal('agent-stub-uuid'),
      span => expect(span.data.kafka.error).to.not.exist,
      span => expect(span.ec).to.equal(0),
      span => expect(span.async).to.not.exist,
      span => expect(span.data).to.exist,
      span => expect(span.data.kafka).to.be.an('object'),
      span => expect(span.data.kafka.service).to.equal(topic),
      span => expect(span.data.kafka.access).to.equal('consume')
    ]);
  }

  function verifyKafkaAvroExit(_senderControls, spans, parent) {
    return expectExactlyOneMatching(spans, [
      span => expect(span.n).to.equal('kafka'),
      span => expect(span.k).to.equal(constants.EXIT),
      span => expect(span.t).to.equal(parent.t),
      span => expect(span.p).to.equal(parent.s),
      span => expect(span.f.e).to.equal(String(_senderControls.getPid())),
      span => expect(span.f.h).to.equal('agent-stub-uuid'),
      span => expect(span.error).to.not.exist,
      span => expect(span.ec).to.equal(0),
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
      tracingEnabled: false
    });

    ProcessControls.setUpHooksWithRetryTime(retryTime, producerControls);

    describe('producing and consuming', () => {
      const consumerControls = new ProcessControls({
        appPath: path.join(__dirname, 'consumer'),
        port: 3215,
        useGlobalAgent: true,
        tracingEnabled: false
      });

      ProcessControls.setUpHooksWithRetryTime(retryTime, consumerControls);

      it('should not trace for producing / consuming messages', async () => {
        const response = await producerControls.sendRequest({
          method: 'GET',
          path: '/produce'
        });

        return retry(() => verifyResponseAndMessage(response, consumerControls), retryTime)
          .then(() => delay(config.getTestTimeout() / 4))
          .then(() => agentControls.getSpans())
          .then(spans => {
            if (spans.length > 0) {
              fail(`Unexpected spans (kafka-avro suppressed: ${stringifyItems(spans)}`);
            }
          });
      });
    });
  });

  describe('tracing enabled but suppressed', () => {
    const producerControls = new ProcessControls({
      appPath: path.join(__dirname, 'producer'),
      port: 3216,
      useGlobalAgent: true
    });

    ProcessControls.setUpHooksWithRetryTime(retryTime, producerControls);

    describe('tracing suppressed', () => {
      const receiverControls = new ProcessControls({
        appPath: path.join(__dirname, 'consumer'),
        port: 3215,
        useGlobalAgent: true
      });

      ProcessControls.setUpHooksWithRetryTime(retryTime, receiverControls);

      it("doesn't trace when producing / consuming messages", async () => {
        const response = await producerControls.sendRequest({
          method: 'GET',
          path: '/produce',
          suppressTracing: true
        });

        return retry(() => {
          verifyResponseAndMessage(response, receiverControls);
        }, retryTime)
          .then(() => delay(config.getTestTimeout() / 4))
          .then(() => agentControls.getSpans())
          .then(spans => {
            if (spans.length > 0) {
              fail(`Unexpected spans (kafka avro suppressed: ${stringifyItems(spans)}`);
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

  /**
   * Each message is an object in the following format: {type: 'Buffer', data: number[]}
   */
  const message = receivedMessages
    .map(({ data }) => JSON.parse(Buffer.from(data).toString()))
    .filter(data => data.messageCounter === response.value.messageCounter)[0];

  expect(message).to.exist;
  expect(message.name).to.equal('John');
  return message;
}
