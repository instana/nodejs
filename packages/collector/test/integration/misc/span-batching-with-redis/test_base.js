/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const { expect } = require('chai');

const constants = require('@_local/core').tracing.constants;
const config = require('@_local/core/test/config');
const { getSpansByName, expectExactlyOneMatching, retry, stringifyItems } = require('@_local/core/test/test_util');

const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');

const { AgentStubControls } = require('@_local/collector/test/apps/agentStubControls');
const globalAgent = require('@_local/collector/test/globalAgent');
const { fail } = expect;

module.exports = function () {
  describe('tracing/spanbatching with redis', function () {
    this.timeout(config.getTestTimeout());
    const agentControls = globalAgent.instance;
    globalAgent.setUpCleanUpHooks();

    describe('span batching is not enabled', function () {
      let controls;

      before(async () => {
        controls = new ProcessControls({
          dirname: __dirname,
          useGlobalAgent: true,
          env: {
            REDIS_VERSION: 'v3',
            INSTANA_FORCE_TRANSMISSION_STARTING_AT: 500,
            INSTANA_DEV_BATCH_THRESHOLD: 250 // make sure redis calls are batched even when stuff is slow
          }
        });

        await controls.startAndWaitForAgentConnection();
      });

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });

      after(async () => {
        await controls.stop();
      });

      it('must not batch calls', () =>
        controls
          .sendRequest({
            method: 'POST',
            path: '/quick-successive-calls',
            qs: {
              key: 'price',
              value: 42
            }
          })
          .then(response => {
            expect(String(response)).to.equal('42');

            return retry(() =>
              agentControls.getSpans().then(spans => {
                if (spans.length !== 5) {
                  fail(`Expected 5 spans, but got ${spans.length}: ${stringifyItems(spans)}`);
                }
                expect(spans).to.have.lengthOf(5);
                const redisSpans = getSpansByName(spans, 'redis');

                if (redisSpans.length !== 3) {
                  fail(`Expected 3 Redis spans, but got ${redisSpans.length}: ${stringifyItems(redisSpans)}`);
                }
                expect(redisSpans).to.have.lengthOf(3);
                spans.forEach(s => expect(s.b).to.not.exist);
              })
            );
          }));
    });

    describe('enabled via env var', function () {
      let controls;

      before(async () => {
        controls = new ProcessControls({
          dirname: __dirname,
          useGlobalAgent: true,
          env: {
            REDIS_VERSION: 'v3',
            INSTANA_FORCE_TRANSMISSION_STARTING_AT: 500,
            INSTANA_DEV_BATCH_THRESHOLD: 250, // make sure redis calls are batched even when stuff is slow
            INSTANA_SPANBATCHING_ENABLED: 'true' // TODO remove this when switching to opt-in
          }
        });

        await controls.startAndWaitForAgentConnection();
      });

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });

      after(async () => {
        await controls.stop();
      });

      it('must batch quick short successive calls into one span', () =>
        controls
          .sendRequest({
            method: 'POST',
            path: '/quick-successive-calls',
            qs: {
              key: 'price',
              value: 42
            }
          })
          .then(response => {
            expect(String(response)).to.equal('42');

            return retry(() =>
              agentControls.getSpans().then(spans => {
                const entrySpan = expectExactlyOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.server'),
                  span => expect(span.data.http.method).to.equal('POST')
                ]);

                // It should actually be exactly three spans, one http entry, one http exit and one batched redis span
                // merged from three calls. Since it is timing based, we relax the assertions a bit so the test is less
                // flaky.
                if (spans.length !== 3 && spans.length !== 4) {
                  fail(`Expected 3 (or 4) spans, but got ${spans.length}: ${stringifyItems(spans)}`);
                }

                expectExactlyOneMatching(spans, [
                  span => expect(span.t).to.equal(entrySpan.t),
                  span => expect(span.p).to.equal(entrySpan.s),
                  span => expect(span.n).to.equal('redis'),
                  span => expect(span.k).to.equal(constants.EXIT),
                  span => expect(span.f.e).to.equal(String(controls.getPid())),
                  span => expect(span.f.h).to.equal('agent-stub-uuid'),
                  span => expect(span.ec).to.equal(0),
                  span => expect(span.b).to.be.an('object'),
                  span => expect(span.b.s).to.be.at.least(2),
                  span => expect(span.b.d).to.be.a('number')
                ]);

                verifyHttpExit(controls, spans, entrySpan);
              })
            );
          }));

      // Currently disabled because it seems to be flaky (as time dependent tests often are), plus, span batching is
      // off by default anyway.
      it.skip('must batch calls with errors', () =>
        controls
          .sendRequest({
            method: 'POST',
            path: '/quick-successive-calls-with-errors'
          })
          .then(response => {
            expect(String(response)).to.equal('done');

            return retry(() =>
              agentControls.getSpans().then(spans => {
                const entrySpan = expectExactlyOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.server'),
                  span => expect(span.data.http.method).to.equal('POST')
                ]);

                if (spans.length !== 3) {
                  fail(`Expected 3 spans, but got ${spans.length}: ${stringifyItems(spans)}`);
                }
                expect(spans).to.have.lengthOf(3);

                expectExactlyOneMatching(spans, [
                  span => expect(span.t).to.equal(entrySpan.t),
                  span => expect(span.p).to.equal(entrySpan.s),
                  span => expect(span.n).to.equal('redis'),
                  span => expect(span.k).to.equal(constants.EXIT),
                  span => expect(span.f.e).to.equal(String(controls.getPid())),
                  span => expect(span.f.h).to.equal('agent-stub-uuid'),
                  span => expect(span.ec).to.equal(2),

                  // The get calls have errors, thus they should be more significant than the set call for batching.
                  span => expect(span.data.redis.command).to.equal('get'),

                  span => expect(span.b).to.be.an('object'),
                  span => expect(span.b.s).to.equal(3),
                  span => expect(span.b.d).to.be.a('number'),

                  span => expect(span.data.redis.error).to.be.a('string'),
                  span => expect(span.data.redis.error).to.contain('wrong number of arguments for')
                ]);

                verifyHttpExit(controls, spans, entrySpan);
              })
            );
          }));
    });

    describe('enabled via agent config', function () {
      const customAgentControls = new AgentStubControls();
      let controls;

      before(async () => {
        await customAgentControls.startAgent({ enableSpanBatching: true });

        controls = new ProcessControls({
          dirname: __dirname,
          agentControls: customAgentControls,
          env: {
            REDIS_VERSION: 'v3',
            INSTANA_FORCE_TRANSMISSION_STARTING_AT: 500,
            INSTANA_DEV_BATCH_THRESHOLD: 250 // make sure redis calls are batched even when stuff is slow
          }
        });

        await controls.start();
      });

      beforeEach(async () => {
        await customAgentControls.clearReceivedTraceData();
      });

      after(async () => {
        await controls.stop();
        await customAgentControls.stopAgent();
      });

      it('must batch quick short successive calls into one span', () =>
        controls
          .sendRequest({
            method: 'POST',
            path: '/quick-successive-calls',
            qs: {
              key: 'price',
              value: 42
            }
          })
          .then(response => {
            expect(String(response)).to.equal('42');

            return retry(() =>
              customAgentControls.getSpans().then(spans => {
                const entrySpan = expectExactlyOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.server'),
                  span => expect(span.data.http.method).to.equal('POST')
                ]);

                // It should actually be exactly three spans, one http entry, one http exit and one batched redis span
                // merged from three calls. Since it is timing based, we relax the assertions a bit so the test is less
                // flaky.
                if (spans.length !== 3 && spans.length !== 4) {
                  fail(`Expected 3 (or 4) spans, but got ${spans.length}: ${stringifyItems(spans)}`);
                }

                expectExactlyOneMatching(spans, [
                  span => expect(span.t).to.equal(entrySpan.t),
                  span => expect(span.p).to.equal(entrySpan.s),
                  span => expect(span.n).to.equal('redis'),
                  span => expect(span.k).to.equal(constants.EXIT),
                  span => expect(span.f.e).to.equal(String(controls.getPid())),
                  span => expect(span.f.h).to.equal('agent-stub-uuid'),
                  span => expect(span.ec).to.equal(0),
                  span => expect(span.b).to.be.an('object'),
                  span => expect(span.b.s).to.be.at.least(2),
                  span => expect(span.b.d).to.be.a('number')
                ]);

                verifyHttpExit(controls, spans, entrySpan);
              })
            );
          }));

      // Currently disabled because it seems to be flaky (as time dependent tests often are), plus, span batching is
      // off by default anyway.
      it.skip('must batch calls with errors', () =>
        controls
          .sendRequest({
            method: 'POST',
            path: '/quick-successive-calls-with-errors'
          })
          .then(response => {
            expect(String(response)).to.equal('done');

            return retry(() =>
              customAgentControls.getSpans().then(spans => {
                const entrySpan = expectExactlyOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.server'),
                  span => expect(span.data.http.method).to.equal('POST')
                ]);

                if (spans.length !== 3) {
                  fail(`Expected 3 spans, but got ${spans.length}: ${stringifyItems(spans)}`);
                }
                expect(spans).to.have.lengthOf(3);

                expectExactlyOneMatching(spans, [
                  span => expect(span.t).to.equal(entrySpan.t),
                  span => expect(span.p).to.equal(entrySpan.s),
                  span => expect(span.n).to.equal('redis'),
                  span => expect(span.k).to.equal(constants.EXIT),
                  span => expect(span.f.e).to.equal(String(controls.getPid())),
                  span => expect(span.f.h).to.equal('agent-stub-uuid'),
                  span => expect(span.ec).to.equal(2),

                  // The get calls have errors, thus they should be more significant than the set call for batching.
                  span => expect(span.data.redis.command).to.equal('get'),

                  span => expect(span.b).to.be.an('object'),
                  span => expect(span.b.s).to.equal(3),
                  span => expect(span.b.d).to.be.a('number'),

                  span => expect(span.data.redis.error).to.be.a('string'),
                  span => expect(span.data.redis.error).to.contain('wrong number of arguments for')
                ]);

                verifyHttpExit(controls, spans, entrySpan);
              })
            );
          }));
    });
  });
};

function verifyHttpExit(controls, spans, parent) {
  expectExactlyOneMatching(spans, [
    span => expect(span.t).to.equal(parent.t),
    span => expect(span.p).to.equal(parent.s),
    span => expect(span.n).to.equal('node.http.client'),
    span => expect(span.k).to.equal(constants.EXIT),
    span => expect(span.f.e).to.equal(String(controls.getPid())),
    span => expect(span.f.h).to.equal('agent-stub-uuid'),
    span => expect(span.async).to.not.exist,
    span => expect(span.error).to.not.exist,
    span => expect(span.ec).to.equal(0),
    span => expect(span.data.http.method).to.equal('GET'),
    span => expect(span.data.http.url).to.match(/http:\/\/127\.0\.0\.1:/),
    span => expect(span.data.http.status).to.equal(200)
  ]);
}
