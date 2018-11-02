'use strict';

var expect = require('chai').expect;

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
            expect(span.f.e).to.equal(String(expressKafkaProducerControls.getPid()));
            expect(span.async).to.equal(false);
            expect(span.error).to.equal(false);
            expect(span.data.kafka.access).to.equal('send');
            expect(span.data.kafka.service).to.equal('test');
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
                  expect(span.f.e).to.equal(String(expressKafkaProducerControls.getPid()));
                  expect(span.async).to.equal(false);
                  expect(span.error).to.equal(false);
                  expect(span.data.kafka.access).to.equal('send');
                  expect(span.data.kafka.service).to.equal('test');
                });

                utils.expectOneMatching(spans, function(span) {
                  expect(span.p).to.equal(undefined);
                  expect(span.n).to.equal('kafka');
                  expect(span.f.e).to.equal(String(kafkaConsumerControls.getPid()));
                  expect(span.async).to.equal(false);
                  expect(span.error).to.equal(false);
                  expect(span.data.kafka.access).to.equal('consume');
                  expect(span.data.kafka.service).to.equal('test');
                });
              });
          });
        });
      });
    });
  });
});
