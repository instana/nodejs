/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const semver = require('semver');
const { expect } = require('chai');
const { fail } = expect;
const constants = require('@_local/core').tracing.constants;
const config = require('@_local/core/test/config');
const delay = require('@_local/core/test/test_util/delay');
const { retry, expectExactlyOneMatching, expectAtLeastOneMatching } = require('@_local/core/test/test_util');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const globalAgent = require('@_local/collector/test/globalAgent');
const agentControls = globalAgent.instance;

module.exports = function (name, version, isLatest) {
  this.timeout(config.getTestTimeout() * 2);

  const isV2 = semver.major(version) >= 2;

  describe('tracing is enabled', function () {
    globalAgent.setUpCleanUpHooks();

    let publisherControls;
    let subscriberControls;

    before(async () => {
      publisherControls = new ProcessControls({
        dirname: __dirname,
        appName: 'publisher',
        useGlobalAgent: true,
        env: {
          LIBRARY_VERSION: version,
          LIBRARY_NAME: name,
          LIBRARY_LATEST: isLatest
        }
      });
      subscriberControls = new ProcessControls({
        dirname: __dirname,
        appName: 'subscriber',
        useGlobalAgent: true,
        env: {
          LIBRARY_VERSION: version,
          LIBRARY_NAME: name,
          LIBRARY_LATEST: isLatest
        }
      });

      await publisherControls.startAndWaitForAgentConnection();
      await subscriberControls.startAndWaitForAgentConnection();
    });

    beforeEach(async () => {
      await agentControls.clearReceivedTraceData();
    });

    after(async () => {
      await publisherControls.stop();
      await subscriberControls.stop();
    });

    afterEach(async () => {
      await publisherControls.clearIpcMessages();
      await subscriberControls.clearIpcMessages();
    });

    describe('publish et al.', function () {
      [false, true].forEach(withCallback => {
        [false, true].forEach(withReply => {
          [false, true].forEach(withError => {
            if (isV2 && withCallback === true) {
              return;
            }

            testPublish.call(this, 'publish', withCallback, withReply, withError);
          });
        });
      });

      testPublish.call(this, 'request', false, false, false);
      testPublish.call(this, 'requestOne', false, false, false);

      if (isV2) {
        testPublish.call(this, 'request', false, false, /* withError */ true);
        testPublish.call(this, 'requestOne', false, false, /* withError */ true);
      }

      it('call two different hosts', async function () {
        await publisherControls.sendRequest({
          method: 'POST',
          path: '/two-different-target-hosts'
        });

        await retry(async () => {
          const spans = await agentControls.getSpans();
          const entrySpan = expectExactlyOneMatching(spans, [
            span => expect(span.n).to.equal('node.http.server'),
            span => expect(span.data.http.method).to.equal('POST')
          ]);

          expectExactlyOneMatching(spans, [
            span => expect(span.t).to.equal(entrySpan.t),
            span => expect(span.p).to.equal(entrySpan.s),
            span => expect(span.n).to.equal('nats'),
            span => expect(span.data.nats.sort).to.equal('publish'),
            span => expect(span.data.nats.address).to.equal('nats://127.0.0.1:4222')
          ]);
          expectExactlyOneMatching(spans, [
            span => expect(span.t).to.equal(entrySpan.t),
            span => expect(span.p).to.equal(entrySpan.s),
            span => expect(span.n).to.equal('nats'),
            span => expect(span.data.nats.sort).to.equal('publish'),
            span => expect(span.data.nats.address).to.equal('nats://localhost:4222')
          ]);
        });
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
                  if (typeof res === 'string') {
                    !isV2 ? expect(res).to.equal('Subject must be supplied') : expect(res).to.equal('BAD_SUBJECT');
                  } else if (typeof res === 'object') {
                    expect(res.code).to.equal('NatsError: BAD_SUBJECT');
                    expect(res.message).to.equal('NatsError: Subject must be supplied');
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
                      span => expect(span.data.nats.address).to.equal('nats://127.0.0.1:4222')
                    ];

                    if (withError && (isV2 || withCallback)) {
                      expectations.push(span => expect(span.ec).to.equal(1));

                      !isV2
                        ? expectations.push(span =>
                            expect(span.data.nats.error).to.equal('NatsError: Subject must be supplied')
                          )
                        : expectations.push(span => expect(span.data.nats.error).to.equal('NatsError: BAD_SUBJECT'));
                    } else {
                      expectations.push(span => expect(span.ec).to.equal(0));
                      expectations.push(span => expect(span.data.nats.error).to.not.exist);
                    }

                    if (!withError) {
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
        const queryParams = ['subscribeTest=true', withError ? 'withError=yes' : null]
          .filter(param => !!param)
          .join('&');

        if (isV2 && !withError) {
          it('must record an entry span when subscribe callback is present', () => {
            const url = '/publish?subscribeSubject=subscribe-test-3';

            return publisherControls
              .sendRequest({
                method: 'POST',
                path: url,
                simple: false
              })
              .then(() =>
                retry(() => {
                  const receivedMessages = subscriberControls.getIpcMessages();
                  expect(receivedMessages).to.have.lengthOf(1);
                  expect(receivedMessages[0]).to.equal("It's nuts, ain't it?!");

                  return agentControls.getSpans().then(spans => {
                    const httpSpan = expectExactlyOneMatching(spans, [
                      span => expect(span.n).to.equal('node.http.server'),
                      span => expect(span.f.e).to.equal(String(publisherControls.getPid())),
                      span => expect(span.p).to.not.exist
                    ]);

                    const expectations = [
                      span => expect(span.t).to.equal(httpSpan.t),
                      span => expect(span.p).to.exist,
                      span => expect(span.k).to.equal(constants.ENTRY),
                      span => expect(span.n).to.equal('nats'),
                      span => expect(span.f.e).to.equal(String(subscriberControls.getPid())),
                      span => expect(span.f.h).to.equal('agent-stub-uuid'),
                      span => expect(span.async).to.not.exist,
                      span => expect(span.ts).to.be.a('number'),
                      span => expect(span.d).to.be.a('number'),

                      span => expect(span.data.nats).to.be.an('object'),
                      span => expect(span.data.nats.sort).to.equal('consume'),
                      span => expect(span.data.nats.subject).to.equal('subscribe-test-3'),
                      span => expect(span.data.nats.address).to.equal('nats://127.0.0.1:4222')
                    ];

                    expectations.push(span => expect(span.error).to.not.exist);
                    expectations.push(span => expect(span.ec).to.equal(0));
                    expectations.push(span => expect(span.data.nats.error).to.not.exist);

                    const natsEntry = expectExactlyOneMatching(spans, expectations);

                    // verify that subsequent calls are correctly traced
                    expectExactlyOneMatching(spans, [
                      span => expect(span.n).to.equal('node.http.client'),
                      span => expect(span.t).to.equal(natsEntry.t),
                      span => expect(span.p).to.equal(natsEntry.s),
                      span => expect(span.k).to.equal(constants.EXIT)
                    ]);
                  });
                })
              );
          });
        }

        it(`must record an entry span when receiving a message (error: ${withError})`, () => {
          const url = `/publish?${queryParams}`;

          return publisherControls
            .sendRequest({
              method: 'POST',
              path: url,
              simple: false
            })
            .then(() =>
              retry(() => {
                const receivedMessages = subscriberControls.getIpcMessages();
                expect(receivedMessages).to.have.lengthOf(1);

                if (withError) {
                  expect(receivedMessages[0]).to.equal('trigger an error');
                } else {
                  expect(receivedMessages[0]).to.equal("It's nuts, ain't it?!");
                }

                return agentControls.getSpans().then(spans => {
                  expect(spans.length).to.equal(5);

                  const httpEntrySpan = expectExactlyOneMatching(spans, [
                    span => expect(span.n).to.equal('node.http.server'),
                    span => expect(span.f.e).to.equal(String(publisherControls.getPid())),
                    span => expect(span.p).to.not.exist
                  ]);

                  expectExactlyOneMatching(spans, [
                    span => expect(span.n).to.equal('node.http.client'),
                    span => expect(span.f.e).to.equal(String(publisherControls.getPid())),
                    span => expect(span.t).to.equal(httpEntrySpan.t),
                    span => expect(span.p).to.equal(httpEntrySpan.s)
                  ]);

                  expectExactlyOneMatching(spans, [
                    span => expect(span.n).to.equal('nats'),
                    span => expect(span.k).to.equal(constants.EXIT),
                    span => expect(span.f.e).to.equal(String(publisherControls.getPid())),
                    span => expect(span.t).to.equal(httpEntrySpan.t),
                    span => expect(span.p).to.equal(httpEntrySpan.s)
                  ]);

                  const expectations = [
                    span =>
                      isV2 ? expect(span.t).to.equal(httpEntrySpan.t) : expect(span.t).to.not.equal(httpEntrySpan.t),
                    span => (isV2 ? expect(span.p).to.exist : expect(span.p).to.not.exist),
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
                    span => expect(span.data.nats.address).to.equal('nats://127.0.0.1:4222')
                  ];

                  if (withError) {
                    expectations.push(span => expect(span.error).to.not.exist);
                    expectations.push(span => expect(span.ec).to.equal(1));
                    expectations.push(span => expect(span.data.nats.error).to.contain('Boom!'));
                  } else {
                    expectations.push(span => expect(span.error).to.not.exist);
                    expectations.push(span => expect(span.ec).to.equal(0));
                    expectations.push(span => expect(span.data.nats.error).to.not.exist);
                  }

                  const natsEntry = expectExactlyOneMatching(spans, expectations);

                  expectExactlyOneMatching(spans, [
                    span => expect(span.n).to.equal('node.http.client'),
                    span => expect(span.f.e).to.equal(String(subscriberControls.getPid())),
                    span =>
                      isV2 ? expect(span.t).to.equal(httpEntrySpan.t) : expect(span.t).to.not.equal(httpEntrySpan.t),
                    span => expect(span.p).to.equal(natsEntry.s)
                  ]);
                });
              })
            );
        });
      }
    });

    describe('suppressed', () => {
      it('should not trace publish when suppressed', async function () {
        return publisherControls
          .sendRequest({
            method: 'POST',
            path: '/publish',
            suppressTracing: true
          })
          .then(res => {
            expect(res).to.equal('OK');
            return delay(1000);
          })
          .then(() => agentControls.getSpans())
          .then(spans => {
            if (isV2) {
              expect(spans).to.have.lengthOf(0);
            } else {
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
                span => expect(span.data.nats.address).to.equal('nats://127.0.0.1:4222'),
                span => expect(span.data.nats.error).to.not.exist
              ]);
            }
          });
      });

      if (isV2) {
        it('should not trace publish when suppressed without headers', async function () {
          return publisherControls
            .sendRequest({
              method: 'POST',
              path: '/publish?noHeaders=true',
              suppressTracing: true
            })
            .then(res => {
              expect(res).to.equal('OK');
              return delay(1000);
            })
            .then(() => agentControls.getSpans())
            .then(spans => {
              expect(spans).to.have.lengthOf(0);
            });
        });
      }
    });
  });

  describe.skip('connect', function () {
    this.timeout(config.getTestTimeout() * 10);

    let publisherControls;

    before(async () => {
      publisherControls = new ProcessControls({
        dirname: __dirname,
        appName: 'publisher',
        useGlobalAgent: true,
        env: {
          LIBRARY_VERSION: version,
          LIBRARY_NAME: name,
          LIBRARY_LATEST: isLatest,
          CONNECT_ERROR: true
        }
      });
    });

    beforeEach(async () => {
      await agentControls.clearReceivedTraceData();
    });

    after(async () => {
      await publisherControls.stop();
    });

    afterEach(async () => {
      await publisherControls.clearIpcMessages();
    });

    it('cannot connect to the nats server', async function () {
      return publisherControls
        .startAndWaitForAgentConnection()
        .then(() => {
          throw new Error('Should not succeed.');
        })
        .catch(err => {
          expect(err.error).to.contain('getaddrinfo ENOTFOUND deno.nats.io');

          return agentControls.getSpans().then(spans => {
            expect(spans.length).to.eql(0);
          });
        })
        .finally(async () => {
          await publisherControls.stop();
        });
    });
  });

  describe('tracing/nats disabled', function () {
    this.timeout(config.getTestTimeout() * 2);

    let publisherControls;
    let subscriberControls;

    before(async () => {
      publisherControls = new ProcessControls({
        dirname: __dirname,
        appName: 'publisher',
        useGlobalAgent: true,
        tracingEnabled: false,
        env: {
          LIBRARY_VERSION: version,
          LIBRARY_NAME: name,
          LIBRARY_LATEST: isLatest
        }
      });
      subscriberControls = new ProcessControls({
        dirname: __dirname,
        appName: 'subscriber',
        useGlobalAgent: true,
        tracingEnabled: false,
        env: {
          LIBRARY_VERSION: version,
          LIBRARY_NAME: name,
          LIBRARY_LATEST: isLatest
        }
      });

      await publisherControls.startAndWaitForAgentConnection();
      await subscriberControls.startAndWaitForAgentConnection();
    });

    beforeEach(async () => {
      await agentControls.clearReceivedTraceData();
    });

    after(async () => {
      await publisherControls.stop();
      await subscriberControls.stop();
    });

    afterEach(async () => {
      await publisherControls.clearIpcMessages();
      await subscriberControls.clearIpcMessages();
    });

    it('should not trace when disabled', () =>
      publisherControls
        .sendRequest({
          method: 'POST',
          path: '/request'
        })
        .then(res => {
          expect(res).to.equal('sending reply');
          return delay(1000);
        })
        .then(() =>
          agentControls.getSpans().then(spans => {
            expect(spans).to.have.lengthOf(0);
          })
        ));
  });
};
