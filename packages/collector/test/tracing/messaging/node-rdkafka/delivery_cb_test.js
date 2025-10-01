/*
 * (c) Copyright IBM Corp. 2025
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

const {
  tracing: { supportedVersion }
} = require('@instana/core');

// TODO: 3.4.0 introduces some bugs
// https://github.com/Blizzard/node-rdkafka/issues/1128
// https://github.com/Blizzard/node-rdkafka/issues/1123#issuecomment-2855329479
const producerEnableDeliveryCb = 'true';
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

const testDefinition = require('./test_definition');

// node bin/start-test-containers.js --zookeeper --kafka --schema-registry --kafka-topics
const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/messaging/node-rdkafka: with delivery-cb', function () {
  testDefinition.run.bind(this)({
    producerEnableDeliveryCb,
    producerApiMethods,
    consumerApiMethods,
    objectModeMethods,
    withErrorMethods,
    RUN_SINGLE_TEST,
    SINGLE_TEST_PROPS
  });
});
