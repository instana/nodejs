/* global Promise */

'use strict';

const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const utils = require('../../../../../core/test/utils');
const exchange = require('./amqpUtil').exchange;
const queueName = require('./amqpUtil').queueName;
const queueNameGet = require('./amqpUtil').queueNameGet;
const queueNameConfirm = require('./amqpUtil').queueNameConfirm;

let publisherControls;
let consumerControls;
let agentStubControls;

describe('tracing/amqp', () => {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

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
      utils.retry(() =>
        agentStubControls.getSpans().then(spans => {
          const entrySpan = utils.expectOneMatching(spans, span => {
            expect(span.n).to.equal('node.http.server');
            expect(span.f.e).to.equal(String(publisherControls.getPid()));
            expect(span.f.h).to.equal('agent-stub-uuid');
            expect(span.async).to.not.exist;
            expect(span.error).to.not.exist;
            expect(span.ec).to.equal(0);
          });

          utils.expectOneMatching(spans, span => {
            expect(span.t).to.equal(entrySpan.t);
            expect(span.p).to.equal(entrySpan.s);
            expect(span.k).to.equal(constants.EXIT);
            expect(span.n).to.equal('rabbitmq');
            expect(span.f.e).to.equal(String(publisherControls.getPid()));
            expect(span.f.h).to.equal('agent-stub-uuid');
            expect(span.async).to.not.exist;
            expect(span.error).to.not.exist;
            expect(span.ec).to.equal(0);
            expect(span.data.rabbitmq.sort).to.equal('publish');
            expect(span.data.rabbitmq.exchange).to.not.exist;
            expect(span.data.rabbitmq.key).to.equal(queueName);
            expect(span.data.rabbitmq.address).to.equal('amqp://127.0.0.1:5672');
          });

          // verify that subsequent calls are correctly traced
          utils.expectOneMatching(spans, span => {
            expect(span.n).to.equal('node.http.client');
            expect(span.t).to.equal(entrySpan.t);
            expect(span.p).to.equal(entrySpan.s);
            expect(span.k).to.equal(constants.EXIT);
          });
        })
      )
    ));

  it('must record an exit span for publish', () =>
    publisherControls.publish('Ohai!').then(() =>
      utils.retry(() =>
        agentStubControls.getSpans().then(spans => {
          const entrySpan = utils.expectOneMatching(spans, span => {
            expect(span.n).to.equal('node.http.server');
            expect(span.f.e).to.equal(String(publisherControls.getPid()));
            expect(span.f.h).to.equal('agent-stub-uuid');
            expect(span.async).to.not.exist;
            expect(span.error).to.not.exist;
            expect(span.ec).to.equal(0);
          });

          utils.expectOneMatching(spans, span => {
            expect(span.t).to.equal(entrySpan.t);
            expect(span.p).to.equal(entrySpan.s);
            expect(span.k).to.equal(constants.EXIT);
            expect(span.n).to.equal('rabbitmq');
            expect(span.f.e).to.equal(String(publisherControls.getPid()));
            expect(span.f.h).to.equal('agent-stub-uuid');
            expect(span.async).to.not.exist;
            expect(span.error).to.not.exist;
            expect(span.ec).to.equal(0);
            expect(span.data.rabbitmq.sort).to.equal('publish');
            expect(span.data.rabbitmq.exchange).to.equal(exchange);
            expect(span.data.rabbitmq.address).to.equal('amqp://127.0.0.1:5672');
          });

          // verify that subsequent calls are correctly traced
          utils.expectOneMatching(spans, span => {
            expect(span.n).to.equal('node.http.client');
            expect(span.t).to.equal(entrySpan.t);
            expect(span.p).to.equal(entrySpan.s);
            expect(span.k).to.equal(constants.EXIT);
          });
        })
      )
    ));

  it('must record an entry span for consume without exchange', () =>
    publisherControls.sendToQueue('Ohai').then(() =>
      utils.retry(() =>
        agentStubControls.getSpans().then(spans => {
          const rabbitMqExit = utils.expectOneMatching(spans, span => {
            expect(span.k).to.equal(constants.EXIT);
            expect(span.n).to.equal('rabbitmq');
          });

          const rabbitMqEntry = utils.expectOneMatching(spans, span => {
            expect(span.t).to.equal(rabbitMqExit.t);
            expect(span.p).to.equal(rabbitMqExit.s);
            expect(span.n).to.equal('rabbitmq');
            expect(span.k).to.equal(constants.ENTRY);
            expect(span.d).to.be.greaterThan(99);
            expect(span.f.e).to.equal(String(consumerControls.getPid()));
            expect(span.f.h).to.equal('agent-stub-uuid');
            expect(span.async).to.not.exist;
            expect(span.error).to.not.exist;
            expect(span.ec).to.equal(0);
            expect(span.data.rabbitmq.sort).to.equal('consume');
            expect(span.data.rabbitmq.key).to.equal(queueName);
            expect(span.data.rabbitmq.address).to.equal('amqp://127.0.0.1:5672');
          });

          // verify that subsequent calls are correctly traced
          utils.expectOneMatching(spans, span => {
            expect(span.n).to.equal('node.http.client');
            expect(span.t).to.equal(rabbitMqExit.t);
            expect(span.p).to.equal(rabbitMqEntry.s);
            expect(span.k).to.equal(constants.EXIT);
          });
        })
      )
    ));

  it('must record an entry span for consume with exchange', () =>
    publisherControls.publish('Ohai').then(() =>
      utils.retry(() =>
        agentStubControls.getSpans().then(spans => {
          const rabbitMqExit = utils.expectOneMatching(spans, span => {
            expect(span.k).to.equal(constants.EXIT);
            expect(span.n).to.equal('rabbitmq');
          });

          const rabbitMqEntry = utils.expectOneMatching(spans, span => {
            expect(span.t).to.equal(rabbitMqExit.t);
            expect(span.p).to.equal(rabbitMqExit.s);
            expect(span.n).to.equal('rabbitmq');
            expect(span.k).to.equal(constants.ENTRY);
            expect(span.d).to.be.greaterThan(99);
            expect(span.f.e).to.equal(String(consumerControls.getPid()));
            expect(span.f.h).to.equal('agent-stub-uuid');
            expect(span.async).to.not.exist;
            expect(span.error).to.not.exist;
            expect(span.ec).to.equal(0);
            expect(span.data.rabbitmq.sort).to.equal('consume');
            expect(span.data.rabbitmq.exchange).to.equal(exchange);
            expect(span.data.rabbitmq.address).to.equal('amqp://127.0.0.1:5672');
          });

          // verify that subsequent calls are correctly traced
          utils.expectOneMatching(spans, span => {
            expect(span.n).to.equal('node.http.client');
            expect(span.t).to.equal(rabbitMqExit.t);
            expect(span.p).to.equal(rabbitMqEntry.s);
            expect(span.k).to.equal(constants.EXIT);
          });
        })
      )
    ));

  it('must record an entry span for channel#get', () =>
    publisherControls.sendToGetQueue('Ohai').then(() =>
      utils.retry(() =>
        agentStubControls.getSpans().then(spans => {
          const rabbitMqExit = utils.expectOneMatching(spans, span => {
            expect(span.k).to.equal(constants.EXIT);
            expect(span.n).to.equal('rabbitmq');
          });

          const rabbitMqEntry = utils.expectOneMatching(spans, span => {
            expect(span.t).to.equal(rabbitMqExit.t);
            expect(span.p).to.equal(rabbitMqExit.s);
            expect(span.n).to.equal('rabbitmq');
            expect(span.k).to.equal(constants.ENTRY);
            expect(span.d).to.be.greaterThan(99);
            expect(span.f.e).to.equal(String(consumerControls.getPid()));
            expect(span.f.h).to.equal('agent-stub-uuid');
            expect(span.async).to.not.exist;
            expect(span.error).to.not.exist;
            expect(span.ec).to.equal(0);
            expect(span.data.rabbitmq.sort).to.equal('consume');
            expect(span.data.rabbitmq.key).to.equal(queueNameGet);
            expect(span.data.rabbitmq.address).to.equal('amqp://127.0.0.1:5672');
          });

          // verify that subsequent calls are correctly traced
          utils.expectOneMatching(spans, span => {
            expect(span.n).to.equal('node.http.client');
            expect(span.t).to.equal(rabbitMqExit.t);
            expect(span.p).to.equal(rabbitMqEntry.s);
            expect(span.k).to.equal(constants.EXIT);
          });
        })
      )
    ));

  it('must record an exit span for ConfirmChannel#sendToQueue', () =>
    publisherControls.sendToConfirmQueue('Ohai!').then(() =>
      utils.retry(() =>
        agentStubControls.getSpans().then(spans => {
          const entrySpan = utils.expectOneMatching(spans, span => {
            expect(span.n).to.equal('node.http.server');
            expect(span.f.e).to.equal(String(publisherControls.getPid()));
            expect(span.f.h).to.equal('agent-stub-uuid');
            expect(span.async).to.not.exist;
            expect(span.error).to.not.exist;
            expect(span.ec).to.equal(0);
          });

          utils.expectOneMatching(spans, span => {
            expect(span.t).to.equal(entrySpan.t);
            expect(span.p).to.equal(entrySpan.s);
            expect(span.k).to.equal(constants.EXIT);
            expect(span.n).to.equal('rabbitmq');
            expect(span.f.e).to.equal(String(publisherControls.getPid()));
            expect(span.f.h).to.equal('agent-stub-uuid');
            expect(span.async).to.not.exist;
            expect(span.error).to.not.exist;
            expect(span.ec).to.equal(0);
            expect(span.data.rabbitmq.sort).to.equal('publish');
            expect(span.data.rabbitmq.exchange).to.not.exist;
            expect(span.data.rabbitmq.key).to.equal(queueNameConfirm);
            expect(span.data.rabbitmq.address).to.equal('amqp://127.0.0.1:5672');
          });

          // verify that subsequent calls are correctly traced
          utils.expectOneMatching(spans, span => {
            expect(span.n).to.equal('node.http.client');
            expect(span.t).to.equal(entrySpan.t);
            expect(span.p).to.equal(entrySpan.s);
            expect(span.k).to.equal(constants.EXIT);
          });
        })
      )
    ));

  it('must record an entry span for ConfirmChannel.consume', () =>
    publisherControls.sendToConfirmQueue('Ohai').then(() =>
      utils.retry(() =>
        agentStubControls.getSpans().then(spans => {
          const rabbitMqExit = utils.expectOneMatching(spans, span => {
            expect(span.k).to.equal(constants.EXIT);
            expect(span.n).to.equal('rabbitmq');
          });

          const rabbitMqEntry = utils.expectOneMatching(spans, span => {
            expect(span.t).to.equal(rabbitMqExit.t);
            expect(span.p).to.equal(rabbitMqExit.s);
            expect(span.n).to.equal('rabbitmq');
            expect(span.k).to.equal(constants.ENTRY);
            expect(span.f.e).to.equal(String(consumerControls.getPid()));
            expect(span.f.h).to.equal('agent-stub-uuid');
            expect(span.async).to.not.exist;
            expect(span.error).to.not.exist;
            expect(span.ec).to.equal(0);
            expect(span.data.rabbitmq.sort).to.equal('consume');
            expect(span.data.rabbitmq.key).to.equal(queueNameConfirm);
            expect(span.data.rabbitmq.address).to.equal('amqp://127.0.0.1:5672');
          });

          // verify that subsequent calls are correctly traced
          utils.expectOneMatching(spans, span => {
            expect(span.n).to.equal('node.http.client');
            expect(span.t).to.equal(rabbitMqExit.t);
            expect(span.p).to.equal(rabbitMqEntry.s);
            expect(span.k).to.equal(constants.EXIT);
          });
        })
      )
    ));
}
