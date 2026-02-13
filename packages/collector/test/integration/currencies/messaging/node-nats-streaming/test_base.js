/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const expect = require('chai').expect;
const { v4: uuid } = require('uuid');

const constants = require('@_local/core').tracing.constants;
const config = require('@_local/core/test/config');
const {
  delay,
  stringifyItems,
  expectExactlyOneMatching,
  expectAtLeastOneMatching,
  retry
} = require('@_local/core/test/test_util');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const globalAgent = require('@_local/collector/test/globalAgent');

const agentControls = globalAgent.instance;

// Note: nats-streaming is in the process of being deprecated.
// https://docs.nats.io/legacy/stan#warning-deprecation-notice

module.exports = function (name, version, isLatest) {
  describe('tracing is enabled', function () {
    this.timeout(config.getTestTimeout() * 2);

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
              return retry(() => {
                const receivedMessages = subscriberControls.getIpcMessages();
                if (!withError) {
                  expect(receivedMessages).to.have.lengthOf.at.least(1);
                  expect(receivedMessages[receivedMessages.length - 1]).to.equal(uniqueId);
                }

                return agentControls.getSpans().then(spans => {
                  const entrySpan = expectAtLeastOneMatching(spans, [
                    span => expect(span.n).to.equal('node.http.server'),
                    span => expect(span.f.e).to.equal(String(publisherControls.getPid())),
                    span => expect(span.p).to.not.exist
                  ]);
                  expectAtLeastOneMatching(spans, span => {
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
                    expect(span.data.nats.address).to.equal(process.env.INSTANA_CONNECT_NATS_STREAMING);
                    if (withError) {
                      expect(span.data.nats.error).to.equal('Error: stan: invalid publish request');
                    } else {
                      expect(span.data.nats.error).to.not.exist;
                    }
                  });
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
        });
      }

      it('call two different hosts', async function () {
        const res = await publisherControls.sendRequest({
          method: 'POST',
          path: '/two-different-target-hosts'
        });

        expect(res).to.equal('OK');

        await retry(async () => {
          const spans = await agentControls.getSpans();
          const entrySpan = expectExactlyOneMatching(spans, [
            span => expect(span.n).to.equal('node.http.server'),
            span => expect(span.data.http.method).to.equal('POST')
          ]);

          expectExactlyOneMatching(spans, [
            span => expect(span.t).to.equal(entrySpan.t),
            span => expect(span.p).to.equal(entrySpan.s),
            span => expect(span.k).to.equal(constants.EXIT),
            span => expect(span.n).to.equal('nats.streaming'),
            span => expect(span.data.nats.sort).to.equal('publish'),
            span => expect(span.data.nats.address).to.equal(process.env.INSTANA_CONNECT_NATS_STREAMING)
          ]);
          expectExactlyOneMatching(spans, [
            span => expect(span.t).to.equal(entrySpan.t),
            span => expect(span.p).to.equal(entrySpan.s),
            span => expect(span.k).to.equal(constants.EXIT),
            span => expect(span.n).to.equal('nats.streaming'),
            span => expect(span.data.nats.sort).to.equal('publish'),
            span => expect(span.data.nats.address).to.equal(process.env.INSTANA_CONNECT_NATS_STREAMING_ALTERNATIVE)
          ]);
        });
      });
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
            .then(() =>
              retry(() => {
                const receivedMessages = subscriberControls.getIpcMessages();
                if (!withError) {
                  expect(receivedMessages).to.have.lengthOf.at.least(1);
                  expect(receivedMessages[receivedMessages.length - 1]).to.equal(uniqueId);
                }

                agentControls.getSpans().then(spans => {
                  const httpSpan = expectAtLeastOneMatching(spans, [
                    span => expect(span.n).to.equal('node.http.server'),
                    span => expect(span.f.e).to.equal(String(publisherControls.getPid())),
                    span => expect(span.p).to.not.exist
                  ]);

                  // NATS does not support headers or metadata, so we do not have trace continuity.
                  const natsEntry = expectAtLeastOneMatching(spans, span => {
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
                    expect(span.data.nats.address).to.equal(process.env.INSTANA_CONNECT_NATS_STREAMING);
                    if (withError) {
                      expect(span.data.nats.error).to.equal(`Error: Boom: ${uniqueId}`);
                    } else {
                      expect(span.data.nats.error).to.not.exist;
                    }
                  });
                  // verify that subsequent calls are correctly traced
                  expectAtLeastOneMatching(spans, [
                    span => expect(span.n).to.equal('node.http.client'),
                    span => expect(span.t).to.equal(natsEntry.t),
                    span => expect(span.p).to.equal(natsEntry.s),
                    span => expect(span.k).to.equal(constants.EXIT),
                    span => expect(span.f.e).to.equal(String(subscriberControls.getPid())),
                    span => expect(span.f.h).to.equal('agent-stub-uuid')
                  ]);
                });
              })
            );
        });
      }
    });

    // This case currently does not work, because we cannot forward suppression headers in nats v1 instrumentation.
    // Updating nats to 2.0 would solve this. But we will not invest into nats-streaming instrumentation anymore, since
    // nats-streaming is being deprecated.
    describe.skip('suppressed', function () {
      this.timeout(config.getTestTimeout() * 2);

      it('should not trace', async function () {
        await publisherControls.sendRequest({
          method: 'POST',
          path: '/publish',
          suppressTracing: true
        });

        await delay(1000);
        const spans = await agentControls.getSpans();
        if (spans.length > 0) {
          expect.fail(`Unexpected spans: ${stringifyItems(spans)}`);
        }
      });
    });
  });

  describe('tracing is disabled', function () {
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
          path: '/publish'
        })
        .then(res => {
          expect(res).to.equal('OK');
          return delay(1000);
        })
        .then(() =>
          agentControls.getSpans().then(spans => {
            expect(spans).to.have.lengthOf(0);
          })
        ));
  });
};
