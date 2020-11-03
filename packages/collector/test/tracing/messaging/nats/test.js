'use strict';

const path = require('path');
const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const delay = require('../../../../../core/test/test_util/delay');
const testUtils = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');

describe('tracing/nats', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  this.timeout(config.getTestTimeout() * 2);
  const agentControls = require('../../../apps/agentStubControls');
  agentControls.registerTestHooks();
  const publisherControls = new ProcessControls({
    port: 3216,
    appPath: path.join(__dirname, 'publisher'),
    agentControls
  }).registerTestHooks();
  const subscriberControls = new ProcessControls({
    appPath: path.join(__dirname, 'subscriber'),
    agentControls
  }).registerTestHooks();

  describe('publish et al.', function() {
    [false, true].forEach(withCallback => {
      [false, true].forEach(withReply => {
        [false, true].forEach(withError => {
          testPublish.call(this, 'publish', withCallback, withReply, withError);
        });
      });
    });

    [false, true].forEach(withError => {
      // nats.request always uses a mandatory callback and an implicit reply
      testPublish.call(this, 'request', false, false, withError);
      testPublish.call(this, 'requestOne', false, false, withError);
    });

    function testPublish(publishMethod, withCallback, withReply, withError) {
      const queryParams = [
        withCallback ? 'withCallback=yes' : null,
        withReply ? 'withReply=yes' : null,
        withError ? 'withError=yes' : null,
        publishMethod === 'requestOne' ? 'requestOne=yes' : null
      ]
        .filter(param => !!param)
        .join('&');

      it(
        `must record an exit span for nats.${publishMethod} ` +
          `(callback: ${withCallback}, reply: ${withReply}, error: ${withError})`,
        () => {
          publishMethod = publishMethod === 'requestOne' ? 'request' : publishMethod;
          const url = queryParams ? `/${publishMethod}?${queryParams}` : `/${publishMethod}`;
          return publisherControls
            .sendRequest({
              method: 'POST',
              path: url,
              simple: false
            })
            .then(res => {
              if (withError) {
                expect(res).to.equal('Subject must be supplied');
              } else if (publishMethod === 'request') {
                expect(res).to.equal('sending reply');
              } else {
                expect(res).to.equal('OK');
              }
              return testUtils.retry(() => {
                const receivedMessages = subscriberControls.getIpcMessages();
                if (withError) {
                  expect(receivedMessages).to.have.lengthOf(0);
                } else {
                  expect(receivedMessages).to.have.lengthOf(1);
                  if (publishMethod === 'request') {
                    expect(receivedMessages[0]).to.equal('awaiting reply');
                  } else {
                    expect(receivedMessages[0]).to.equal("It's nuts, ain't it?!");
                  }
                }
                return agentControls.getSpans().then(spans => {
                  const entrySpan = testUtils.expectAtLeastOneMatching(spans, span => {
                    expect(span.n).to.equal('node.http.server');
                    expect(span.f.e).to.equal(String(publisherControls.getPid()));
                    expect(span.p).to.not.exist;
                  });
                  testUtils.expectAtLeastOneMatching(spans, span => {
                    expect(span.t).to.equal(entrySpan.t);
                    expect(span.p).to.equal(entrySpan.s);
                    expect(span.k).to.equal(constants.EXIT);
                    expect(span.n).to.equal('nats');
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
                    if (!withError) {
                      // we omit the subject to trigger an error, that's why we only test it in non-error tests
                      expect(span.data.nats.subject).to.equal('publish-test-subject');
                    }
                    expect(span.data.nats.address).to.equal('nats://localhost:4222');
                    if (withError) {
                      expect(span.data.nats.error).to.equal('Subject must be supplied');
                    } else {
                      expect(span.data.nats.error).to.not.exist;
                    }
                  });
                  // verify that subsequent calls are correctly traced
                  testUtils.expectAtLeastOneMatching(spans, span => {
                    expect(span.n).to.equal('node.http.client');
                    expect(span.t).to.equal(entrySpan.t);
                    expect(span.p).to.equal(entrySpan.s);
                    expect(span.k).to.equal(constants.EXIT);
                  });
                });
              });
            });
        }
      );
    }
  });

  describe('subscribe', function() {
    [false, true].forEach(withError => {
      testSubscribe.call(this, withError);
    });

    function testSubscribe(withError) {
      const queryParams = [
        'subscribeTest=true', //
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
            expect(receivedMessages).to.have.lengthOf(1);
            if (withError) {
              expect(receivedMessages[0]).to.equal('trigger an error');
            } else {
              expect(receivedMessages[0]).to.equal("It's nuts, ain't it?!");
            }

            return testUtils.retry(() =>
              agentControls.getSpans().then(spans => {
                const httpSpan = testUtils.expectAtLeastOneMatching(spans, span => {
                  expect(span.n).to.equal('node.http.server');
                  expect(span.f.e).to.equal(String(publisherControls.getPid()));
                  expect(span.p).to.not.exist;
                });

                // NATS does not support headers or metadata, so we do not have trace continuity.
                const natsEntry = testUtils.expectAtLeastOneMatching(spans, span => {
                  expect(span.t).to.not.equal(httpSpan.t);
                  expect(span.p).to.not.exist;
                  expect(span.k).to.equal(constants.ENTRY);
                  expect(span.n).to.equal('nats');
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
                  expect(span.data.nats.address).to.equal('nats://localhost:4222');
                  if (withError) {
                    expect(span.data.nats.error).to.equal('Boom!');
                  } else {
                    expect(span.data.nats.error).to.not.exist;
                  }
                });
                // verify that subsequent calls are correctly traced
                testUtils.expectAtLeastOneMatching(spans, span => {
                  expect(span.n).to.equal('node.http.client');
                  expect(span.t).to.equal(natsEntry.t);
                  expect(span.p).to.equal(natsEntry.s);
                  expect(span.k).to.equal(constants.EXIT);
                });
              })
            );
          });
      });
    }
  });

  describe('suppressed', () => {
    it('should not trace publish when suppressed', () =>
      publisherControls
        .sendRequest({
          method: 'POST',
          path: '/publish',
          headers: {
            'X-INSTANA-L': '0'
          }
        })
        .then(res => {
          expect(res).to.equal('OK');
          return delay(config.getTestTimeout() / 4);
        })
        .then(() => agentControls.getSpans())
        .then(spans => {
          // Verify that only span is present (only the nats receive entry, but no nats publish exit):
          // (Since we cannot transmit X-INSTANA-L=0 over nats due to lack of metadata, the receive entry will be
          // there):
          expect(spans).to.have.lengthOf(1);
          testUtils.expectAtLeastOneMatching(spans, span => {
            expect(span.t).to.be.a('string');
            expect(span.p).to.not.exist;
            expect(span.k).to.equal(constants.ENTRY);
            expect(span.n).to.equal('nats');
            expect(span.f.e).to.equal(String(subscriberControls.getPid()));
            expect(span.f.h).to.equal('agent-stub-uuid');
            expect(span.async).to.not.exist;
            expect(span.ts).to.be.a('number');
            expect(span.d).to.be.a('number');
            expect(span.error).to.not.exist;
            expect(span.ec).to.equal(0);
            expect(span.data.nats).to.be.an('object');
            expect(span.data.nats.sort).to.equal('consume');
            expect(span.data.nats.subject).to.equal('publish-test-subject');
            expect(span.data.nats.address).to.equal('nats://localhost:4222');
            expect(span.data.nats.error).to.not.exist;
          });
        }));
  });
});

describe('tracing/nats disabled', function() {
  this.timeout(config.getTestTimeout() * 2);
  const agentControls = require('../../../apps/agentStubControls');
  agentControls.registerTestHooks();
  const publisherControls = new ProcessControls({
    appPath: path.join(__dirname, 'publisher'),
    port: 3216,
    agentControls,
    tracingEnabled: false
  }).registerTestHooks();
  new ProcessControls({
    appPath: path.join(__dirname, 'subscriber'),
    agentControls,
    tracingEnabled: false
  }).registerTestHooks();

  it('should not trace when disabled', () =>
    publisherControls
      .sendRequest({
        method: 'POST',
        path: '/request?requestOne=yes'
      })
      .then(res => {
        expect(res).to.equal('sending reply');
        return delay(config.getTestTimeout() / 4);
      })
      .then(() =>
        agentControls.getSpans().then(spans => {
          expect(spans).to.have.lengthOf(0);
        })
      ));
});
