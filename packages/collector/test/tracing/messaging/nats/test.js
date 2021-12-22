/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const path = require('path');
const { expect } = require('chai');
const { fail } = expect;
const semver = require('semver');

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const delay = require('../../../../../core/test/test_util/delay');
const { retry, expectExactlyOneMatching, expectAtLeastOneMatching } = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');

const agentControls = globalAgent.instance;

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

const natsVersion = require('nats/package.json').version;

mochaSuiteFn('tracing/nats', function () {
  this.timeout(config.getTestTimeout() * 2);

  globalAgent.setUpCleanUpHooks();

  const publisherControls = new ProcessControls({
    port: 3216,
    appPath: path.join(__dirname, 'publisher'),
    useGlobalAgent: true
  });
  const subscriberControls = new ProcessControls({
    appPath: path.join(__dirname, 'subscriber'),
    useGlobalAgent: true
  });
  ProcessControls.setUpHooks(publisherControls, subscriberControls);

  describe('publish et al.', function () {
    [false, true].forEach(withCallback => {
      [false, true].forEach(withReply => {
        [false, true].forEach(withError => {
          testPublish.call(this, 'publish', withCallback, withReply, withError);
        });
      });
    });

    // nats.request always uses a mandatory callback and an implicit reply
    testPublish.call(this, 'request', false, false, false);
    testPublish.call(this, 'requestOne', false, false, false);

    if (semver.lt(natsVersion, '1.4.12')) {
      // Due to a change in nats@1.4.12, publisher errors are no longer captured as spans when
      // nats.request or nats.requestOne is used (in contrast to the more usual nats.publish).
      // See https://github.com/nats-io/nats.js/commit/9f34226823ffbd63c6f139a9d12b368a4a8adb93
      //   #diff-eb672f729dbb809e0a46163f59b4f93a76975fd0b7461640db7527ecfc346749R1918.
      // Fixing this would require to also instrument nats.request and nats.requestOne individually. Since 1.4.12 is the
      // last 1.x version, this has not been implemented (and potentially never will, just for this one edge case).
      testPublish.call(this, 'request', false, false, /* withError */ true);
      testPublish.call(this, 'requestOne', false, false, /* withError */ true);
    }

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
                if (typeof res === 'string') {
                  expect(res).to.equal('Subject must be supplied');
                } else if (typeof res === 'object') {
                  expect(res.code).to.equal('BAD_SUBJECT');
                  expect(res.message).to.equal('Subject must be supplied');
                } else {
                  fail(`Unexpected response of type "${typeof res}": ${JSON.stringify(res)}`);
                }
              } else if (publishMethod === 'request') {
                expect(res).to.equal('sending reply');
              } else {
                expect(res).to.equal('OK');
              }
              return retry(() => {
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
                  const entrySpan = expectExactlyOneMatching(spans, [
                    span => expect(span.n).to.equal('node.http.server'),
                    span => expect(span.f.e).to.equal(String(publisherControls.getPid())),
                    span => expect(span.p).to.not.exist
                  ]);

                  const expectations = [
                    span => expect(span.t).to.equal(entrySpan.t),
                    span => expect(span.p).to.equal(entrySpan.s),
                    span => expect(span.k).to.equal(constants.EXIT),
                    span => expect(span.n).to.equal('nats'),
                    span => expect(span.f.e).to.equal(String(publisherControls.getPid())),
                    span => expect(span.f.h).to.equal('agent-stub-uuid'),
                    span => expect(span.async).to.not.exist,
                    span => expect(span.ts).to.be.a('number'),
                    span => expect(span.d).to.be.a('number'),

                    span => expect(span.data.nats).to.be.an('object'),
                    span => expect(span.data.nats.sort).to.equal('publish'),
                    span => expect(span.data.nats.address).to.equal('nats://localhost:4222')
                  ];

                  if (withError && (semver.lt(natsVersion, '1.4.12') || withCallback)) {
                    // Starting with nats@1.4.12, nats changed how publisher errors are treated when no callback has
                    // been provided. Previously, they would be thrown as a synchronous error (allowing us to capture
                    // them and annotate them on the span). Starting with 1.4.12, the are only emitted via an event
                    // listener. By design, we deliberately do not register our own event listener on nats, so publisher
                    // errors are not captured.
                    expectations.push(span => expect(span.ec).to.equal(1));
                    expectations.push(span => expect(span.data.nats.error).to.equal('Subject must be supplied'));
                  } else {
                    expectations.push(span => expect(span.ec).to.equal(0));
                    expectations.push(span => expect(span.data.nats.error).to.not.exist);
                  }

                  if (!withError) {
                    // we omit the subject to trigger an error, that's why we only test it in non-error tests
                    expectations.push(span => expect(span.data.nats.subject).to.equal('publish-test-subject'));
                  }

                  expectExactlyOneMatching(spans, expectations);

                  // verify that subsequent calls are correctly traced
                  expectAtLeastOneMatching(spans, [
                    span => expect(span.n).to.equal('node.http.client'),
                    span => expect(span.t).to.equal(entrySpan.t),
                    span => expect(span.p).to.equal(entrySpan.s),
                    span => expect(span.k).to.equal(constants.EXIT)
                  ]);
                });
              });
            });
        }
      );
    }
  });

  describe('subscribe', function () {
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
            return retry(() => {
              const receivedMessages = subscriberControls.getIpcMessages();
              expect(receivedMessages).to.have.lengthOf(1);
              if (withError) {
                expect(receivedMessages[0]).to.equal('trigger an error');
              } else {
                expect(receivedMessages[0]).to.equal("It's nuts, ain't it?!");
              }

              agentControls.getSpans().then(spans => {
                const httpSpan = expectExactlyOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.server'),
                  span => expect(span.f.e).to.equal(String(publisherControls.getPid())),
                  span => expect(span.p).to.not.exist
                ]);

                // NATS does not support headers or metadata, so we do not have trace continuity.
                const expectations = [
                  span => expect(span.t).to.not.equal(httpSpan.t),
                  span => expect(span.p).to.not.exist,
                  span => expect(span.k).to.equal(constants.ENTRY),
                  span => expect(span.n).to.equal('nats'),
                  span => expect(span.f.e).to.equal(String(subscriberControls.getPid())),
                  span => expect(span.f.h).to.equal('agent-stub-uuid'),
                  span => expect(span.async).to.not.exist,
                  span => expect(span.ts).to.be.a('number'),
                  span => expect(span.d).to.be.a('number'),

                  span => expect(span.data.nats).to.be.an('object'),
                  span => expect(span.data.nats.sort).to.equal('consume'),
                  span => expect(span.data.nats.subject).to.equal('subscribe-test-subject'),
                  span => expect(span.data.nats.address).to.equal('nats://localhost:4222')
                ];

                if (withError) {
                  expectations.push(span => expect(span.error).to.not.exist);
                  expectations.push(span => expect(span.ec).to.equal(1));
                  expectations.push(span => expect(span.data.nats.error).to.equal('Boom!'));
                } else {
                  expectations.push(span => expect(span.error).to.not.exist);
                  expectations.push(span => expect(span.ec).to.equal(0));
                  expectations.push(span => expect(span.data.nats.error).to.not.exist);
                }
                const natsEntry = expectExactlyOneMatching(spans, expectations);

                // verify that subsequent calls are correctly traced
                expectExactlyOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.client'),
                  span => expect(span.t).to.equal(natsEntry.t),
                  span => expect(span.p).to.equal(natsEntry.s),
                  span => expect(span.k).to.equal(constants.EXIT)
                ]);
              });
            });
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
          expectExactlyOneMatching(spans, [
            span => expect(span.t).to.be.a('string'),
            span => expect(span.p).to.not.exist,
            span => expect(span.k).to.equal(constants.ENTRY),
            span => expect(span.n).to.equal('nats'),
            span => expect(span.f.e).to.equal(String(subscriberControls.getPid())),
            span => expect(span.f.h).to.equal('agent-stub-uuid'),
            span => expect(span.async).to.not.exist,
            span => expect(span.ts).to.be.a('number'),
            span => expect(span.d).to.be.a('number'),
            span => expect(span.error).to.not.exist,
            span => expect(span.ec).to.equal(0),
            span => expect(span.data.nats).to.be.an('object'),
            span => expect(span.data.nats.sort).to.equal('consume'),
            span => expect(span.data.nats.subject).to.equal('publish-test-subject'),
            span => expect(span.data.nats.address).to.equal('nats://localhost:4222'),
            span => expect(span.data.nats.error).to.not.exist
          ]);
        }));
  });
});

describe('tracing/nats disabled', function () {
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
