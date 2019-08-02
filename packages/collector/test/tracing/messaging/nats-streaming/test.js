'use strict';

const expect = require('chai').expect;
const uuid = require('uuid/v4');

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../config');
const delay = require('../../../test_util/delay');
const utils = require('../../../utils');

describe('tracing/nats-streaming', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  const agentControls = require('../../../apps/agentStubControls');
  const PublisherControls = require('./publisherControls');
  const SubscriberControls = require('./subscriberControls');
  const publisherControls = new PublisherControls({
    agentControls
  });
  const subscriberControls = new SubscriberControls({
    agentControls
  });

  this.timeout(config.getTestTimeout() * 2);

  agentControls.registerTestHooks();
  publisherControls.registerTestHooks();
  subscriberControls.registerTestHooks();

  describe('publish et al.', function() {
    [false, true].forEach(withError => {
      testPublish.call(this, withError);
    });

    function testPublish(withError) {
      const uniqueId = uuid();
      const queryParams = [
        withError ? 'withError=yes' : null, //
        `id=${uniqueId}`
      ]
        .filter(param => !!param)
        .join('&');

      it(`must record an exit span for nats streaming publish (error: ${withError})`, () => {
        const url = `/publish?${queryParams}`;
        return publisherControls
          .sendRequest({
            method: 'POST',
            path: url,
            simple: false
          })
          .then(res => {
            if (withError) {
              expect(res).to.equal('stan: invalid publish request');
            } else {
              expect(res).to.equal('OK');
            }
            return utils.retry(() => {
              const receivedMessages = subscriberControls.getIpcMessages();
              if (!withError) {
                expect(receivedMessages).to.have.lengthOf.at.least(1);
                expect(receivedMessages[receivedMessages.length - 1]).to.equal(uniqueId);
              }

              return agentControls.getSpans().then(spans => {
                const entrySpan = utils.expectOneMatching(spans, span => {
                  expect(span.n).to.equal('node.http.server');
                  expect(span.f.e).to.equal(String(publisherControls.getPid()));
                  expect(span.p).to.not.exist;
                });
                utils.expectOneMatching(spans, span => {
                  expect(span.t).to.equal(entrySpan.t);
                  expect(span.p).to.equal(entrySpan.s);
                  expect(span.k).to.equal(constants.EXIT);
                  expect(span.n).to.equal('nats.streaming');
                  expect(span.f.e).to.equal(String(publisherControls.getPid()));
                  expect(span.f.h).to.equal('agent-stub-uuid');
                  expect(span.async).to.equal(false);
                  expect(span.ts).to.be.a('number');
                  expect(span.d).to.be.a('number');
                  if (withError) {
                    expect(span.error).to.be.true;
                    expect(span.ec).to.equal(1);
                  } else {
                    expect(span.error).to.be.false;
                    expect(span.ec).to.equal(0);
                  }
                  expect(span.data.nats).to.be.an('object');
                  expect(span.data.nats.sort).to.equal('publish');
                  if (withError) {
                    expect(span.data.nats.subject).to.not.exist;
                  } else {
                    expect(span.data.nats.subject).to.equal('publish-test-subject');
                  }
                  expect(span.data.nats.address).to.equal('nats://localhost:4223');
                  if (withError) {
                    expect(span.data.nats.error).to.equal('stan: invalid publish request');
                  } else {
                    expect(span.data.nats.error).to.not.exist;
                  }
                });
                // verify that subsequent calls are correctly traced
                utils.expectOneMatching(spans, span => {
                  expect(span.n).to.equal('node.http.client');
                  expect(span.t).to.equal(entrySpan.t);
                  expect(span.p).to.equal(entrySpan.s);
                  expect(span.k).to.equal(constants.EXIT);
                });
              });
            });
          });
      });
    }
  });

  describe('subscribe', function() {
    [false, true].forEach(withError => {
      testSubscribe.call(this, withError);
    });

    function testSubscribe(withError) {
      const uniqueId = uuid();
      const queryParams = [
        'subscribeTest=true', //
        `id=${uniqueId}`,
        withError ? 'withError=yes' : null //
      ]
        .filter(param => !!param)
        .join('&');

      it(`must record an entry span when receiving a message (error: ${withError})`, () => {
        const url = `/publish?${queryParams}`;
        return publisherControls
          .sendRequest({
            method: 'POST',
            path: url,
            simple: false
          })
          .then(() => {
            const receivedMessages = subscriberControls.getIpcMessages();
            if (!withError) {
              expect(receivedMessages).to.have.lengthOf.at.least(1);
              expect(receivedMessages[receivedMessages.length - 1]).to.equal(uniqueId);
            }

            return utils.retry(() => {
              return agentControls.getSpans().then(spans => {
                const httpSpan = utils.expectOneMatching(spans, span => {
                  expect(span.n).to.equal('node.http.server');
                  expect(span.f.e).to.equal(String(publisherControls.getPid()));
                  expect(span.p).to.not.exist;
                });

                // NATS does not support headers or metadata, so we do not have trace continuity.
                const natsEntry = utils.expectOneMatching(spans, span => {
                  expect(span.t).to.not.equal(httpSpan.t);
                  expect(span.p).to.not.exist;
                  expect(span.k).to.equal(constants.ENTRY);
                  expect(span.n).to.equal('nats.streaming');
                  expect(span.f.e).to.equal(String(subscriberControls.getPid()));
                  expect(span.f.h).to.equal('agent-stub-uuid');
                  expect(span.async).to.equal(false);
                  expect(span.ts).to.be.a('number');
                  expect(span.d).to.be.a('number');
                  if (withError) {
                    expect(span.error).to.be.true;
                    expect(span.ec).to.equal(1);
                  } else {
                    expect(span.error).to.be.false;
                    expect(span.ec).to.equal(0);
                  }
                  expect(span.data.nats).to.be.an('object');
                  expect(span.data.nats.sort).to.equal('consume');
                  expect(span.data.nats.subject).to.equal('subscribe-test-subject');
                  expect(span.data.nats.address).to.equal('nats://localhost:4223');
                  if (withError) {
                    expect(span.data.nats.error).to.equal('Boom: ' + uniqueId);
                  } else {
                    expect(span.data.nats.error).to.not.exist;
                  }
                });
                // verify that subsequent calls are correctly traced
                utils.expectOneMatching(spans, span => {
                  expect(span.n).to.equal('node.http.client');
                  expect(span.t).to.equal(natsEntry.t);
                  expect(span.p).to.equal(natsEntry.s);
                  expect(span.k).to.equal(constants.EXIT);
                  expect(span.f.e).to.equal(String(subscriberControls.getPid()));
                  expect(span.f.h).to.equal('agent-stub-uuid');
                });
              });
            });
          });
      });
    }
  });
});

describe('disabled', function() {
  const agentControls = require('../../../apps/agentStubControls');
  const PublisherControls = require('./publisherControls');
  const SubscriberControls = require('./subscriberControls');
  const publisherControls = new PublisherControls({
    agentControls,
    tracingEnabled: false
  });
  const subscriberControls = new SubscriberControls({
    agentControls,
    tracingEnabled: false
  });

  this.timeout(config.getTestTimeout() * 2);

  agentControls.registerTestHooks();
  publisherControls.registerTestHooks();
  subscriberControls.registerTestHooks();

  it('should not trace when disabled', () =>
    publisherControls
      .sendRequest({
        method: 'POST',
        path: '/publish'
      })
      .then(res => {
        expect(res).to.equal('OK');
        return delay(config.getTestTimeout() / 4);
      })
      .then(() =>
        agentControls.getSpans().then(spans => {
          expect(spans).to.have.lengthOf(0);
        })
      ));
});
