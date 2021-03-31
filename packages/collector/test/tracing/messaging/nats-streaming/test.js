/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const path = require('path');
const expect = require('chai').expect;
const { v4: uuid } = require('uuid');

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const delay = require('../../../../../core/test/test_util/delay');
const testUtils = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');

const agentControls = globalAgent.instance;

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/nats-streaming', function () {
  this.timeout(config.getTestTimeout() * 2);

  globalAgent.setUpCleanUpHooks();

  const publisherControls = new ProcessControls({
    appPath: path.join(__dirname, 'publisher'),
    port: 3216,
    useGlobalAgent: true
  });
  const subscriberControls = new ProcessControls({
    appPath: path.join(__dirname, 'subscriber'),
    useGlobalAgent: true
  });
  ProcessControls.setUpHooks(publisherControls, subscriberControls);

  describe('publish et al.', function () {
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
            return testUtils.retry(() => {
              const receivedMessages = subscriberControls.getIpcMessages();
              if (!withError) {
                expect(receivedMessages).to.have.lengthOf.at.least(1);
                expect(receivedMessages[receivedMessages.length - 1]).to.equal(uniqueId);
              }

              return agentControls.getSpans().then(spans => {
                const entrySpan = testUtils.expectAtLeastOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.server'),
                  span => expect(span.f.e).to.equal(String(publisherControls.getPid())),
                  span => expect(span.p).to.not.exist
                ]);
                testUtils.expectAtLeastOneMatching(spans, span => {
                  expect(span.t).to.equal(entrySpan.t);
                  expect(span.p).to.equal(entrySpan.s);
                  expect(span.k).to.equal(constants.EXIT);
                  expect(span.n).to.equal('nats.streaming');
                  expect(span.f.e).to.equal(String(publisherControls.getPid()));
                  expect(span.f.h).to.equal('agent-stub-uuid');
                  expect(span.async).to.not.exist;
                  expect(span.ts).to.be.a('number');
                  expect(span.d).to.be.a('number');
                  if (withError) {
                    expect(span.error).to.not.exist;
                    expect(span.ec).to.equal(1);
                  } else {
                    expect(span.error).to.not.exist;
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
                testUtils.expectAtLeastOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.client'),
                  span => expect(span.t).to.equal(entrySpan.t),
                  span => expect(span.p).to.equal(entrySpan.s),
                  span => expect(span.k).to.equal(constants.EXIT)
                ]);
              });
            });
          });
      });
    }
  });

  describe('subscribe', function () {
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

            return testUtils.retry(() =>
              agentControls.getSpans().then(spans => {
                const httpSpan = testUtils.expectAtLeastOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.server'),
                  span => expect(span.f.e).to.equal(String(publisherControls.getPid())),
                  span => expect(span.p).to.not.exist
                ]);

                // NATS does not support headers or metadata, so we do not have trace continuity.
                const natsEntry = testUtils.expectAtLeastOneMatching(spans, span => {
                  expect(span.t).to.not.equal(httpSpan.t);
                  expect(span.p).to.not.exist;
                  expect(span.k).to.equal(constants.ENTRY);
                  expect(span.n).to.equal('nats.streaming');
                  expect(span.f.e).to.equal(String(subscriberControls.getPid()));
                  expect(span.f.h).to.equal('agent-stub-uuid');
                  expect(span.async).to.not.exist;
                  expect(span.ts).to.be.a('number');
                  expect(span.d).to.be.a('number');
                  if (withError) {
                    expect(span.error).to.not.exist;
                    expect(span.ec).to.equal(1);
                  } else {
                    expect(span.error).to.not.exist;
                    expect(span.ec).to.equal(0);
                  }
                  expect(span.data.nats).to.be.an('object');
                  expect(span.data.nats.sort).to.equal('consume');
                  expect(span.data.nats.subject).to.equal('subscribe-test-subject');
                  expect(span.data.nats.address).to.equal('nats://localhost:4223');
                  if (withError) {
                    expect(span.data.nats.error).to.equal(`Boom: ${uniqueId}`);
                  } else {
                    expect(span.data.nats.error).to.not.exist;
                  }
                });
                // verify that subsequent calls are correctly traced
                testUtils.expectAtLeastOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.client'),
                  span => expect(span.t).to.equal(natsEntry.t),
                  span => expect(span.p).to.equal(natsEntry.s),
                  span => expect(span.k).to.equal(constants.EXIT),
                  span => expect(span.f.e).to.equal(String(subscriberControls.getPid())),
                  span => expect(span.f.h).to.equal('agent-stub-uuid')
                ]);
              })
            );
          });
      });
    }
  });
});

describe('disabled', function () {
  this.timeout(config.getTestTimeout() * 2);

  const publisherControls = new ProcessControls({
    appPath: path.join(__dirname, 'publisher'),
    port: 3216,
    useGlobalAgent: true,
    tracingEnabled: false
  });
  const subscriberControls = new ProcessControls({
    appPath: path.join(__dirname, 'subscriber'),
    useGlobalAgent: true,
    tracingEnabled: false
  });
  ProcessControls.setUpHooks(publisherControls, subscriberControls);

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
