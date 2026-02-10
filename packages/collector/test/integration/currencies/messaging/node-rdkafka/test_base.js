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

const consumerApiMethods = ['standard', 'stream'];
const objectModeMethods = ['true', 'false'];
const withErrorMethods = [false, 'bufferErrorSender', 'deliveryErrorSender', 'streamErrorReceiver'];
const RUN_SINGLE_TEST = false;

module.exports = function (name, version, isLatest, mode) {
  if (mode === 'withDeliveryCbAndStandardProducer') {
    describe('with delivery-cb, standard producer', function () {
      testDefinition.run.bind(this)({
        version,
        name,
        isLatest,
        producerEnableDeliveryCb: 'true',
        producerApiMethods: ['standard'],
        consumerApiMethods,
        objectModeMethods,
        withErrorMethods,
        RUN_SINGLE_TEST,
        runOtherTests: false,
        SINGLE_TEST_PROPS: {
          producerMethod: 'standard',
          consumerMethod: 'standard',
          objectMode: 'true',
          deliveryCbEnabled: 'true',
          withError: false
        }
      });
    });
  }

  if (mode === 'withDeliveryCbAndStreamProducer') {
    describe('with delivery-cb, stream producer', function () {
      testDefinition.run.bind(this)({
        version,
        name,
        isLatest,
        producerEnableDeliveryCb: 'true',
        producerApiMethods: ['stream'],
        consumerApiMethods,
        objectModeMethods,
        withErrorMethods,
        RUN_SINGLE_TEST,
        runOtherTests: false,
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

  if (mode === 'withoutDeliveryCbAndStandardProducer') {
    describe('without delivery-cb, standard producer', function () {
      testDefinition.run.bind(this)({
        version,
        name,
        isLatest,
        producerEnableDeliveryCb: 'false',
        producerApiMethods: ['standard'],
        consumerApiMethods,
        objectModeMethods,
        withErrorMethods,
        RUN_SINGLE_TEST,
        runOtherTests: false,
        SINGLE_TEST_PROPS: {
          producerMethod: 'standard',
          consumerMethod: 'standard',
          objectMode: 'true',
          deliveryCbEnabled: 'false',
          withError: false
        }
      });
    });
  }

  if (mode === 'withoutDeliveryCbAndStreamProducer') {
    describe('without delivery-cb, stream producer', function () {
      testDefinition.run.bind(this)({
        version,
        name,
        isLatest,
        producerEnableDeliveryCb: 'false',
        producerApiMethods: ['stream'],
        consumerApiMethods,
        objectModeMethods,
        withErrorMethods,
        RUN_SINGLE_TEST,
        runOtherTests: false,
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

  if (mode === 'other') {
    describe('other', function () {
      testDefinition.run.bind(this)({
        version,
        name,
        isLatest,
        producerEnableDeliveryCb: 'true',
        producerApiMethods: [],
        consumerApiMethods: [],
        objectModeMethods: [],
        withErrorMethods: [],
        RUN_SINGLE_TEST: false,
        runOtherTests: true,
        SINGLE_TEST_PROPS: {}
      });
    });
  }
};
