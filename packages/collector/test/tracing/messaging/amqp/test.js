/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const { delay, expectExactlyOneMatching, retry } = require('../../../../../core/test/test_util');
const globalAgent = require('../../../globalAgent');

const exchange = require('./amqpUtil').exchange;
const queueName = require('./amqpUtil').queueName;
const queueNameGet = require('./amqpUtil').queueNameGet;
const queueNameConfirm = require('./amqpUtil').queueNameConfirm;

const agentControls = globalAgent.instance;
let publisherControls;
let consumerControls;

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

['latest', '0.8.0'].forEach(version => {
  mochaSuiteFn(`tracing/amqp: ${version}`, function () {
    this.timeout(config.getTestTimeout());

    globalAgent.setUpCleanUpHooks();

    publisherControls = require('./publisherControls');
    consumerControls = require('./consumerControls');

    ['Promises', 'Callbacks'].forEach(apiType => {
      describe(apiType, function () {
        registerTests.call(this, apiType, version);
      });
    });
  });

  function registerTests(apiType) {
    publisherControls.registerTestHooks({
      apiType,
      version
    });
    consumerControls.registerTestHooks({
      apiType,
      version
    });

    beforeEach(() =>
      Promise.all([
        agentControls.waitUntilAppIsCompletelyInitialized(consumerControls.getPid()),
        agentControls.waitUntilAppIsCompletelyInitialized(publisherControls.getPid())
      ])
    );

    it('must record an exit span for sendToQueue', () =>
      publisherControls.sendToQueue('Ohai!').then(() =>
        retry(() =>
          agentControls.getSpans().then(spans => {
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
          agentControls.getSpans().then(spans => {
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
          agentControls.getSpans().then(spans => {
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
          agentControls.getSpans().then(spans => {
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
          agentControls.getSpans().then(spans => {
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
          agentControls.getSpans().then(spans => {
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
          agentControls.getSpans().then(spans => {
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
          .then(() => agentControls.getSpans())
          .then(spans => expect(spans).to.be.empty));

      it('must propagate suppression downstream for publish', () =>
        publisherControls
          .publish('Ohai!', { 'X-INSTANA-L': 0 })
          .then(() => delay(500))
          .then(() => agentControls.getSpans())
          .then(spans => expect(spans).to.be.empty));
    });

    function verifyHttpEntry(spans) {
      return expectExactlyOneMatching(spans, [
        span => expect(span.n).to.equal('node.http.server'),
        span => expect(span.f.e).to.equal(String(publisherControls.getPid())),
        span => expect(span.f.h).to.equal('agent-stub-uuid'),
        span => expect(span.async).to.not.exist,
        span => expect(span.error).to.not.exist,
        span => expect(span.ec).to.equal(0)
      ]);
    }

    function verifyRabbitMqExit(spans, parentSpan) {
      return expectExactlyOneMatching(spans, [
        span => expect(span.t).to.equal(parentSpan.t),
        span => expect(span.p).to.equal(parentSpan.s),
        span => expect(span.k).to.equal(constants.EXIT),
        span => expect(span.n).to.equal('rabbitmq'),
        span => expect(span.f.e).to.equal(String(publisherControls.getPid())),
        span => expect(span.f.h).to.equal('agent-stub-uuid'),
        span => expect(span.async).to.not.exist,
        span => expect(span.error).to.not.exist,
        span => expect(span.ec).to.equal(0),
        span => expect(span.data.rabbitmq.sort).to.equal('publish'),
        span => expect(span.data.rabbitmq.address).to.equal('amqp://127.0.0.1:5672')
      ]);
    }

    function verifyRabbitMqEntry(spans, parentSpan) {
      return expectExactlyOneMatching(spans, [
        span => expect(span.t).to.equal(parentSpan.t),
        span => expect(span.p).to.equal(parentSpan.s),
        span => expect(span.n).to.equal('rabbitmq'),
        span => expect(span.k).to.equal(constants.ENTRY),
        span => expect(span.d).to.be.greaterThan(99),
        span => expect(span.f.e).to.equal(String(consumerControls.getPid())),
        span => expect(span.f.h).to.equal('agent-stub-uuid'),
        span => expect(span.async).to.not.exist,
        span => expect(span.error).to.not.exist,
        span => expect(span.ec).to.equal(0),
        span => expect(span.data.rabbitmq.sort).to.equal('consume'),
        span => expect(span.data.rabbitmq.address).to.equal('amqp://127.0.0.1:5672')
      ]);
    }

    function verifyHttpExit(spans, parentSpan) {
      // verify that subsequent calls are correctly traced
      return expectExactlyOneMatching(spans, [
        span => expect(span.n).to.equal('node.http.client'),
        span => expect(span.t).to.equal(parentSpan.t),
        span => expect(span.p).to.equal(parentSpan.s),
        span => expect(span.k).to.equal(constants.EXIT)
      ]);
    }
  }
});
