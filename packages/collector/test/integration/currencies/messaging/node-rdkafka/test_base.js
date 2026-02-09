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

const testDefinition = require('./test_definition');

const producerApiMethods = ['standard', 'stream'];
const consumerApiMethods = ['standard', 'stream'];
const objectModeMethods = ['true', 'false'];
const withErrorMethods = [false, 'bufferErrorSender', 'deliveryErrorSender', 'streamErrorReceiver'];
const RUN_SINGLE_TEST = false;

module.exports = function (name, version, isLatest, mode) {
  if (!mode || mode === 'withDeliveryCb') {
    describe('with delivery-cb', function () {
      testDefinition.run.bind(this)({
        version,
        name,
        isLatest,
        producerEnableDeliveryCb: 'true',
        producerApiMethods,
        consumerApiMethods,
        objectModeMethods,
        withErrorMethods,
        RUN_SINGLE_TEST,
        SINGLE_TEST_PROPS: {
          producerMethod: 'stream',
          consumerMethod: 'stream',
          objectMode: 'false',
          deliveryCbEnabled: 'true',
          withError: false
        }
      });
    });
  }

  if (!mode || mode === 'withoutDeliveryCb') {
    describe('without delivery-cb', function () {
      testDefinition.run.bind(this)({
        version,
        name,
        isLatest,
        producerEnableDeliveryCb: 'false',
        producerApiMethods,
        consumerApiMethods,
        objectModeMethods,
        withErrorMethods,
        RUN_SINGLE_TEST,
        SINGLE_TEST_PROPS: {
          producerMethod: 'stream',
          consumerMethod: 'stream',
          objectMode: 'false',
          deliveryCbEnabled: 'false',
          withError: false
        }
      });
    });
  }
};
