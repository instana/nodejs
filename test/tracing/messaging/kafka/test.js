'use strict';

var expect = require('chai').expect;

var cls = require('../../../../src/tracing/cls');
var supportedVersion = require('../../../../src/tracing/index').supportedVersion;
var config = require('../../../config');
var utils = require('../../../utils');

describe('tracing/kafka', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  var expressKafkaProducerControls = require('./producerControls');
  var kafkaConsumerControls = require('./consumerControls');
  var agentStubControls = require('../../../apps/agentStubControls');

  // Too many moving parts with Kafka involved. Increase the default timeout.
  // This is especially important since the Kafka client has an
  // exponential backoff implemented.
  this.timeout(config.getTestTimeout() * 2);

  agentStubControls.registerTestHooks();
  expressKafkaProducerControls.registerTestHooks();

  beforeEach(function() {
    return agentStubControls.waitUntilAppIsCompletelyInitialized(expressKafkaProducerControls.getPid());
  });

  it('must record trace publish spans', function() {
    return expressKafkaProducerControls.send('someKey', 'someMessage').then(function() {
      return utils.retry(function() {
        return agentStubControls.getSpans().then(function(spans) {
          var entrySpan = utils.expectOneMatching(spans, function(span) {
            expect(span.n).to.equal('node.http.server');
            expect(span.f.e).to.equal(String(expressKafkaProducerControls.getPid()));
            expect(span.async).to.equal(false);
            expect(span.error).to.equal(false);
          });

          utils.expectOneMatching(spans, function(span) {
            expect(span.t).to.equal(entrySpan.t);
            expect(span.p).to.equal(entrySpan.s);
            expect(span.n).to.equal('kafka');
            expect(span.k).to.equal(cls.EXIT);
            expect(span.f.e).to.equal(String(expressKafkaProducerControls.getPid()));
            expect(span.async).to.equal(false);
            expect(span.error).to.equal(false);
            expect(span.data.kafka.access).to.equal('send');
            expect(span.data.kafka.service).to.equal('test');
          });

          // verify that subsequent calls are correctly traced
          utils.expectOneMatching(spans, function(span) {
            expect(span.n).to.equal('node.http.client');
            expect(span.t).to.equal(entrySpan.t);
            expect(span.p).to.equal(entrySpan.s);
          });
        });
      });
    });
  });

  ['consumerGroup', 'plain', 'highLevel'].forEach(function(consumerType) {
    describe('consuming via: ' + consumerType, function() {
      kafkaConsumerControls.registerTestHooks({
        consumerType: consumerType
      });

      beforeEach(function() {
        return agentStubControls.waitUntilAppIsCompletelyInitialized(kafkaConsumerControls.getPid());
      });

      it('must record kafka consumer spans via:' + consumerType, function() {
        return expressKafkaProducerControls.send('someKey', 'someMessage').then(function() {
          return utils.retry(function() {
            return expressKafkaProducerControls
              .send('someKey', 'someMessage')
              .then(function() {
                return agentStubControls.getSpans();
              })
              .then(function(spans) {
                var entrySpan = utils.expectOneMatching(spans, function(span) {
                  expect(span.n).to.equal('node.http.server');
                  expect(span.f.e).to.equal(String(expressKafkaProducerControls.getPid()));
                  expect(span.async).to.equal(false);
                  expect(span.error).to.equal(false);
                });

                utils.expectOneMatching(spans, function(span) {
                  expect(span.t).to.equal(entrySpan.t);
                  expect(span.p).to.equal(entrySpan.s);
                  expect(span.n).to.equal('kafka');
                  expect(span.k).to.equal(cls.EXIT);
                  expect(span.f.e).to.equal(String(expressKafkaProducerControls.getPid()));
                  expect(span.async).to.equal(false);
                  expect(span.error).to.equal(false);
                  expect(span.data.kafka.access).to.equal('send');
                  expect(span.data.kafka.service).to.equal('test');
                });

                // Actually, we would want the trace started at the HTTP entry to continue here but (as of 2018-11)
                // the Node.js kafka library _still_ has no support for message headers, so we are out of luck in
                // Node.js/kafka. See
                // https://github.com/SOHU-Co/kafka-node/issues/763
                // So for now, span.p is undefined (new root span) and span.t is not equal to entrySpan.t.
                var kafkaConsumeEntry = utils.expectOneMatching(spans, function(span) {
                  expect(span.p).to.equal(undefined);
                  expect(span.n).to.equal('kafka');
                  expect(span.k).to.equal(cls.ENTRY);
                  expect(span.f.e).to.equal(String(kafkaConsumerControls.getPid()));
                  expect(span.async).to.equal(false);
                  expect(span.error).to.equal(false);
                  expect(span.data.kafka.access).to.equal('consume');
                  expect(span.data.kafka.service).to.equal('test');
                });

                // verify that subsequent calls are correctly traced
                utils.expectOneMatching(spans, function(span) {
                  expect(span.n).to.equal('node.http.client');
                  expect(span.t).to.equal(kafkaConsumeEntry.t);
                  expect(span.p).to.equal(kafkaConsumeEntry.s);
                });
              });
          });
        });
      });
    });
  });
});
