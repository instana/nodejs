'use strict';

const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const { delay, expectExactlyOneMatching, retry } = require('../../../../../core/test/test_util');
const exchange = require('./amqpUtil').exchange;
const queueName = require('./amqpUtil').queueName;
const queueNameGet = require('./amqpUtil').queueNameGet;
const queueNameConfirm = require('./amqpUtil').queueNameConfirm;

let publisherControls;
let consumerControls;
let agentStubControls;

describe('tracing/amqp', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  this.timeout(config.getTestTimeout());

  agentStubControls = require('../../../apps/agentStubControls');
  publisherControls = require('./publisherControls');
  consumerControls = require('./consumerControls');

  agentStubControls.registerTestHooks();

  ['Promises', 'Callbacks'].forEach(apiType => {
    describe(apiType, function() {
      registerTests.call(this, apiType);
    });
  });
});

function registerTests(apiType) {
  publisherControls.registerTestHooks({
    apiType
  });
  consumerControls.registerTestHooks({
    apiType
  });

  beforeEach(() =>
    Promise.all([
      agentStubControls.waitUntilAppIsCompletelyInitialized(consumerControls.getPid()),
      agentStubControls.waitUntilAppIsCompletelyInitialized(publisherControls.getPid())
    ])
  );

  it('must record an exit span for sendToQueue', () =>
    publisherControls.sendToQueue('Ohai!').then(() =>
      retry(() =>
        agentStubControls.getSpans().then(spans => {
          const httpEntry = verifyHttpEntry(spans);
          const rabbitMqExit = verifyRabbitMqExit(spans, httpEntry);
          expect(rabbitMqExit.data.rabbitmq.exchange).to.not.exist;
          expect(rabbitMqExit.data.rabbitmq.key).to.equal(queueName);
          verifyHttpExit(spans, httpEntry);
        })
      )
    ));

  it('must record an exit span for publish', () =>
    publisherControls.publish('Ohai!').then(() =>
      retry(() =>
        agentStubControls.getSpans().then(spans => {
          const httpEntry = verifyHttpEntry(spans);
          const rabbitMqExit = verifyRabbitMqExit(spans, httpEntry);
          expect(rabbitMqExit.data.rabbitmq.exchange).to.equal(exchange);
          expect(rabbitMqExit.data.rabbitmq.key).to.not.exist;
          verifyHttpExit(spans, httpEntry);
        })
      )
    ));

  it('must record an entry span for consume without exchange', () =>
    publisherControls.sendToQueue('Ohai').then(() =>
      retry(() =>
        agentStubControls.getSpans().then(spans => {
          const httpEntry = verifyHttpEntry(spans);
          const rabbitMqExit = verifyRabbitMqExit(spans, httpEntry);
          const rabbitMqEntry = verifyRabbitMqEntry(spans, rabbitMqExit);
          expect(rabbitMqEntry.data.rabbitmq.exchange).to.not.exist;
          expect(rabbitMqEntry.data.rabbitmq.key).to.equal(queueName);
          verifyHttpExit(spans, rabbitMqEntry);
        })
      )
    ));

  it('must record an entry span for consume with exchange', () =>
    publisherControls.publish('Ohai').then(() =>
      retry(() =>
        agentStubControls.getSpans().then(spans => {
          const httpEntry = verifyHttpEntry(spans);
          const rabbitMqExit = verifyRabbitMqExit(spans, httpEntry);
          const rabbitMqEntry = verifyRabbitMqEntry(spans, rabbitMqExit);
          expect(rabbitMqEntry.data.rabbitmq.exchange).to.equal(exchange);
          expect(rabbitMqEntry.data.rabbitmq.key).to.not.exist;
          verifyHttpExit(spans, rabbitMqEntry);
        })
      )
    ));

  it('must record an entry span for channel#get', () =>
    publisherControls.sendToGetQueue('Ohai').then(() =>
      retry(() =>
        agentStubControls.getSpans().then(spans => {
          const httpEntry = verifyHttpEntry(spans);
          const rabbitMqExit = verifyRabbitMqExit(spans, httpEntry);
          const rabbitMqEntry = verifyRabbitMqEntry(spans, rabbitMqExit);
          expect(rabbitMqEntry.data.rabbitmq.exchange).to.not.exist;
          expect(rabbitMqEntry.data.rabbitmq.key).to.equal(queueNameGet);
          verifyHttpExit(spans, rabbitMqEntry);
        })
      )
    ));

  it('must record an exit span for ConfirmChannel#sendToQueue', () =>
    publisherControls.sendToConfirmQueue('Ohai!').then(() =>
      retry(() =>
        agentStubControls.getSpans().then(spans => {
          const httpEntry = verifyHttpEntry(spans);
          const rabbitMqExit = verifyRabbitMqExit(spans, httpEntry);
          expect(rabbitMqExit.data.rabbitmq.exchange).to.not.exist;
          expect(rabbitMqExit.data.rabbitmq.key).to.equal(queueNameConfirm);
          verifyHttpExit(spans, httpEntry);
        })
      )
    ));

  it('must record an entry span for ConfirmChannel.consume', () =>
    publisherControls.sendToConfirmQueue('Ohai').then(() =>
      retry(() =>
        agentStubControls.getSpans().then(spans => {
          const httpEntry = verifyHttpEntry(spans);
          const rabbitMqExit = verifyRabbitMqExit(spans, httpEntry);
          const rabbitMqEntry = verifyRabbitMqEntry(spans, rabbitMqExit);
          expect(rabbitMqEntry.data.rabbitmq.exchange).to.not.exist;
          expect(rabbitMqEntry.data.rabbitmq.key).to.equal(queueNameConfirm);
          verifyHttpExit(spans, rabbitMqEntry);
        })
      )
    ));

  describe('with suppression', () => {
    it('must propagate suppression downstream for sendToQueue', () =>
      publisherControls
        .sendToQueue('Ohai', { 'X-INSTANA-L': 0 })
        .then(() => delay(500))
        .then(() => agentStubControls.getSpans())
        .then(spans => expect(spans).to.be.empty));

    it('must propagate suppression downstream for publish', () =>
      publisherControls
        .publish('Ohai!', { 'X-INSTANA-L': 0 })
        .then(() => delay(500))
        .then(() => agentStubControls.getSpans())
        .then(spans => expect(spans).to.be.empty));
  });

  function verifyHttpEntry(spans) {
    return expectExactlyOneMatching(spans, span => {
      expect(span.n).to.equal('node.http.server');
      expect(span.f.e).to.equal(String(publisherControls.getPid()));
      expect(span.f.h).to.equal('agent-stub-uuid');
      expect(span.async).to.not.exist;
      expect(span.error).to.not.exist;
      expect(span.ec).to.equal(0);
    });
  }

  function verifyRabbitMqExit(spans, parentSpan) {
    return expectExactlyOneMatching(spans, span => {
      expect(span.t).to.equal(parentSpan.t);
      expect(span.p).to.equal(parentSpan.s);
      expect(span.k).to.equal(constants.EXIT);
      expect(span.n).to.equal('rabbitmq');
      expect(span.f.e).to.equal(String(publisherControls.getPid()));
      expect(span.f.h).to.equal('agent-stub-uuid');
      expect(span.async).to.not.exist;
      expect(span.error).to.not.exist;
      expect(span.ec).to.equal(0);
      expect(span.data.rabbitmq.sort).to.equal('publish');
      expect(span.data.rabbitmq.address).to.equal('amqp://127.0.0.1:5672');
    });
  }

  function verifyRabbitMqEntry(spans, parentSpan) {
    return expectExactlyOneMatching(spans, span => {
      expect(span.t).to.equal(parentSpan.t);
      expect(span.p).to.equal(parentSpan.s);
      expect(span.n).to.equal('rabbitmq');
      expect(span.k).to.equal(constants.ENTRY);
      expect(span.d).to.be.greaterThan(99);
      expect(span.f.e).to.equal(String(consumerControls.getPid()));
      expect(span.f.h).to.equal('agent-stub-uuid');
      expect(span.async).to.not.exist;
      expect(span.error).to.not.exist;
      expect(span.ec).to.equal(0);
      expect(span.data.rabbitmq.sort).to.equal('consume');
      expect(span.data.rabbitmq.address).to.equal('amqp://127.0.0.1:5672');
    });
  }

  function verifyHttpExit(spans, parentSpan) {
    // verify that subsequent calls are correctly traced
    return expectExactlyOneMatching(spans, span => {
      expect(span.n).to.equal('node.http.client');
      expect(span.t).to.equal(parentSpan.t);
      expect(span.p).to.equal(parentSpan.s);
      expect(span.k).to.equal(constants.EXIT);
    });
  }
}
