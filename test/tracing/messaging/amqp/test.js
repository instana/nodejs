/* global Promise */

'use strict';

var expect = require('chai').expect;

var cls = require('../../../../src/tracing/cls');
var supportedVersion = require('../../../../src/tracing/index').supportedVersion;
var utils = require('../../../utils');
var exchange = require('./amqpUtil').exchange;
var queueName = require('./amqpUtil').queueName;
var queueNameGet = require('./amqpUtil').queueNameGet;
var queueNameConfirm = require('./amqpUtil').queueNameConfirm;

var publisherControls;
var consumerControls;
var agentStubControls;

describe('tracing/amqp', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  agentStubControls = require('../../../apps/agentStubControls');
  publisherControls = require('./publisherControls');
  consumerControls = require('./consumerControls');

  agentStubControls.registerTestHooks();

  ['Promises', 'Callbacks'].forEach(function(apiType) {
    describe(apiType, function() {
      registerTests.call(this, apiType);
    });
  });
});

function registerTests(apiType) {
  publisherControls.registerTestHooks({
    apiType: apiType
  });
  consumerControls.registerTestHooks({
    apiType: apiType
  });

  beforeEach(function() {
    return Promise.all([
      agentStubControls.waitUntilAppIsCompletelyInitialized(consumerControls.getPid()),
      agentStubControls.waitUntilAppIsCompletelyInitialized(publisherControls.getPid())
    ]);
  });

  it('must record an exit span for sendToQueue', function() {
    return publisherControls.sendToQueue('Ohai!').then(function() {
      return utils.retry(function() {
        return agentStubControls.getSpans().then(function(spans) {
          var entrySpan = utils.expectOneMatching(spans, function(span) {
            expect(span.n).to.equal('node.http.server');
            expect(span.f.e).to.equal(String(publisherControls.getPid()));
            expect(span.async).to.equal(false);
            expect(span.error).to.equal(false);
          });

          utils.expectOneMatching(spans, function(span) {
            expect(span.t).to.equal(entrySpan.t);
            expect(span.p).to.equal(entrySpan.s);
            expect(span.k).to.equal(cls.EXIT);
            expect(span.n).to.equal('rabbitmq');
            expect(span.f.e).to.equal(String(publisherControls.getPid()));
            expect(span.async).to.equal(false);
            expect(span.error).to.equal(false);
            expect(span.data.rabbitmq.sort).to.equal('publish');
            expect(span.data.rabbitmq.exchange).to.not.exist;
            expect(span.data.rabbitmq.key).to.equal(queueName);
            expect(span.data.rabbitmq.address).to.equal('amqp://127.0.0.1:5672');
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

  it('must record an exit span for publish', function() {
    return publisherControls.publish('Ohai!').then(function() {
      return utils.retry(function() {
        return agentStubControls.getSpans().then(function(spans) {
          var entrySpan = utils.expectOneMatching(spans, function(span) {
            expect(span.n).to.equal('node.http.server');
            expect(span.f.e).to.equal(String(publisherControls.getPid()));
            expect(span.async).to.equal(false);
            expect(span.error).to.equal(false);
          });

          utils.expectOneMatching(spans, function(span) {
            expect(span.t).to.equal(entrySpan.t);
            expect(span.p).to.equal(entrySpan.s);
            expect(span.k).to.equal(cls.EXIT);
            expect(span.n).to.equal('rabbitmq');
            expect(span.f.e).to.equal(String(publisherControls.getPid()));
            expect(span.async).to.equal(false);
            expect(span.error).to.equal(false);
            expect(span.data.rabbitmq.sort).to.equal('publish');
            expect(span.data.rabbitmq.exchange).to.equal(exchange);
            expect(span.data.rabbitmq.address).to.equal('amqp://127.0.0.1:5672');
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

  it('must record an entry span for consume without exchange', function() {
    return publisherControls.sendToQueue('Ohai').then(function() {
      return utils.retry(function() {
        return agentStubControls.getSpans().then(function(spans) {
          var rabbitMqExit = utils.expectOneMatching(spans, function(span) {
            expect(span.k).to.equal(cls.EXIT);
            expect(span.n).to.equal('rabbitmq');
          });

          var rabbitMqEntry = utils.expectOneMatching(spans, function(span) {
            expect(span.t).to.equal(rabbitMqExit.t);
            expect(span.p).to.equal(rabbitMqExit.s);
            expect(span.n).to.equal('rabbitmq');
            expect(span.k).to.equal(cls.ENTRY);
            expect(span.f.e).to.equal(String(consumerControls.getPid()));
            expect(span.async).to.equal(false);
            expect(span.error).to.equal(false);
            expect(span.data.rabbitmq.sort).to.equal('consume');
            expect(span.data.rabbitmq.key).to.equal(queueName);
            expect(span.data.rabbitmq.address).to.equal('amqp://127.0.0.1:5672');
          });

          // verify that subsequent calls are correctly traced
          utils.expectOneMatching(spans, function(span) {
            expect(span.n).to.equal('node.http.client');
            expect(span.t).to.equal(rabbitMqExit.t);
            expect(span.p).to.equal(rabbitMqEntry.s);
          });
        });
      });
    });
  });

  it('must record an entry span for consume with exchange', function() {
    return publisherControls.publish('Ohai').then(function() {
      return utils.retry(function() {
        return agentStubControls.getSpans().then(function(spans) {
          var rabbitMqExit = utils.expectOneMatching(spans, function(span) {
            expect(span.k).to.equal(cls.EXIT);
            expect(span.n).to.equal('rabbitmq');
          });

          var rabbitMqEntry = utils.expectOneMatching(spans, function(span) {
            expect(span.t).to.equal(rabbitMqExit.t);
            expect(span.p).to.equal(rabbitMqExit.s);
            expect(span.n).to.equal('rabbitmq');
            expect(span.k).to.equal(cls.ENTRY);
            expect(span.f.e).to.equal(String(consumerControls.getPid()));
            expect(span.async).to.equal(false);
            expect(span.error).to.equal(false);
            expect(span.data.rabbitmq.sort).to.equal('consume');
            expect(span.data.rabbitmq.exchange).to.equal(exchange);
            expect(span.data.rabbitmq.address).to.equal('amqp://127.0.0.1:5672');
          });

          // verify that subsequent calls are correctly traced
          utils.expectOneMatching(spans, function(span) {
            expect(span.n).to.equal('node.http.client');
            expect(span.t).to.equal(rabbitMqExit.t);
            expect(span.p).to.equal(rabbitMqEntry.s);
          });
        });
      });
    });
  });

  it('must record an entry span for channel#get', function() {
    return publisherControls.sendToGetQueue('Ohai').then(function() {
      return utils.retry(function() {
        return agentStubControls.getSpans().then(function(spans) {
          var rabbitMqExit = utils.expectOneMatching(spans, function(span) {
            expect(span.k).to.equal(cls.EXIT);
            expect(span.n).to.equal('rabbitmq');
          });

          /* var rabbitMqEntry = */ utils.expectOneMatching(spans, function(span) {
            expect(span.t).to.equal(rabbitMqExit.t);
            expect(span.p).to.equal(rabbitMqExit.s);
            expect(span.n).to.equal('rabbitmq');
            expect(span.k).to.equal(cls.ENTRY);
            expect(span.f.e).to.equal(String(consumerControls.getPid()));
            expect(span.async).to.equal(false);
            expect(span.error).to.equal(false);
            expect(span.data.rabbitmq.sort).to.equal('consume');
            expect(span.data.rabbitmq.key).to.equal(queueNameGet);
            expect(span.data.rabbitmq.address).to.equal('amqp://127.0.0.1:5672');
          });

          // verify that subsequent calls are correctly traced
          utils.expectOneMatching(spans, function(span) {
            expect(span.n).to.equal('node.http.client');
            expect(span.t).to.equal(rabbitMqExit.t);
            // expect(span.p).to.equal(rabbitMqEntry.s);
          });
        });
      });
    });
  });

  it('must record an exit span for ConfirmChannel#sendToQueue', function() {
    return publisherControls.sendToConfirmQueue('Ohai!').then(function() {
      return utils.retry(function() {
        return agentStubControls.getSpans().then(function(spans) {
          var entrySpan = utils.expectOneMatching(spans, function(span) {
            expect(span.n).to.equal('node.http.server');
            expect(span.f.e).to.equal(String(publisherControls.getPid()));
            expect(span.async).to.equal(false);
            expect(span.error).to.equal(false);
          });

          utils.expectOneMatching(spans, function(span) {
            expect(span.t).to.equal(entrySpan.t);
            expect(span.p).to.equal(entrySpan.s);
            expect(span.k).to.equal(cls.EXIT);
            expect(span.n).to.equal('rabbitmq');
            expect(span.f.e).to.equal(String(publisherControls.getPid()));
            expect(span.async).to.equal(false);
            expect(span.error).to.equal(false);
            expect(span.data.rabbitmq.sort).to.equal('publish');
            expect(span.data.rabbitmq.exchange).to.not.exist;
            expect(span.data.rabbitmq.key).to.equal(queueNameConfirm);
            expect(span.data.rabbitmq.address).to.equal('amqp://127.0.0.1:5672');
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

  it('must record an entry span for ConfirmChannel.consume', function() {
    return publisherControls.sendToConfirmQueue('Ohai').then(function() {
      return utils.retry(function() {
        return agentStubControls.getSpans().then(function(spans) {
          var rabbitMqExit = utils.expectOneMatching(spans, function(span) {
            expect(span.k).to.equal(cls.EXIT);
            expect(span.n).to.equal('rabbitmq');
          });

          var rabbitMqEntry = utils.expectOneMatching(spans, function(span) {
            expect(span.t).to.equal(rabbitMqExit.t);
            expect(span.p).to.equal(rabbitMqExit.s);
            expect(span.n).to.equal('rabbitmq');
            expect(span.k).to.equal(cls.ENTRY);
            expect(span.f.e).to.equal(String(consumerControls.getPid()));
            expect(span.async).to.equal(false);
            expect(span.error).to.equal(false);
            expect(span.data.rabbitmq.sort).to.equal('consume');
            expect(span.data.rabbitmq.key).to.equal(queueNameConfirm);
            expect(span.data.rabbitmq.address).to.equal('amqp://127.0.0.1:5672');
          });

          // verify that subsequent calls are correctly traced
          utils.expectOneMatching(spans, function(span) {
            expect(span.n).to.equal('node.http.client');
            expect(span.t).to.equal(rabbitMqExit.t);
            expect(span.p).to.equal(rabbitMqEntry.s);
          });
        });
      });
    });
  });
}
