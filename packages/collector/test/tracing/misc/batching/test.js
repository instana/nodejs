'use strict';

const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const {
  getSpansByName,
  expectAtLeastOneMatching,
  expectExactlyOneMatching,
  retry
} = require('../../../../../core/test/test_util');

const ProcessControls = require('../../../test_util/ProcessControls');

describe('tracing/batching', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  const agentControls = require('../../../apps/agentStubControls');

  this.timeout(config.getTestTimeout());

  describe('enabled via env var', function() {
    agentControls.registerTestHooks();

    const controls = new ProcessControls({
      dirname: __dirname,
      agentControls,
      env: {
        INSTANA_FORCE_TRANSMISSION_STARTING_AT: 500,
        INSTANA_DEV_BATCH_THRESHOLD: 250, // make sure redis calls are batched even when stuff is slow
        INSTANA_SPANBATCHING_ENABLED: 'true' // TODO remove this when switching to opt-in
      }
    }).registerTestHooks();

    runTests(controls);
  });

  describe('enabled via agent config', function() {
    agentControls.registerTestHooks({ enableSpanBatching: true });

    const controls = new ProcessControls({
      dirname: __dirname,
      agentControls,
      env: {
        INSTANA_FORCE_TRANSMISSION_STARTING_AT: 500,
        INSTANA_DEV_BATCH_THRESHOLD: 250 // make sure redis calls are batched even when stuff is slow
      }
    }).registerTestHooks();

    runTests(controls);
  });

  describe('span batching is not enabled', function() {
    agentControls.registerTestHooks();

    const controls = new ProcessControls({
      dirname: __dirname,
      agentControls,
      env: {
        INSTANA_FORCE_TRANSMISSION_STARTING_AT: 500,
        INSTANA_DEV_BATCH_THRESHOLD: 250 // make sure redis calls are batched even when stuff is slow
      }
    }).registerTestHooks();

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
              expect(spans).to.have.lengthOf(5);
              const redisSpans = getSpansByName(spans, 'redis');
              expect(redisSpans).to.have.lengthOf(3);
              spans.forEach(s => expect(s.b).to.not.exist);
            })
          );
        }));
  });

  function runTests(controls) {
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
              const entrySpan = expectAtLeastOneMatching(spans, span => {
                expect(span.n).to.equal('node.http.server');
                expect(span.data.http.method).to.equal('POST');
              });

              expect(spans).to.have.lengthOf(3);

              expectExactlyOneMatching(spans, span => {
                expect(span.t).to.equal(entrySpan.t);
                expect(span.p).to.equal(entrySpan.s);
                expect(span.n).to.equal('redis');
                expect(span.k).to.equal(constants.EXIT);
                expect(span.f.e).to.equal(String(controls.getPid()));
                expect(span.f.h).to.equal('agent-stub-uuid');
                expect(span.ec).to.equal(0);
                expect(span.data.redis.command).to.equal('set'); // because set is the first call

                expect(span.b).to.be.an('object');
                expect(span.b.s).to.equal(3);
                expect(span.b.d).to.be.a('number');
              });

              verifyHttpExit(controls, spans, entrySpan);
            })
          );
        }));

    it('must batch calls with errors', () =>
      controls
        .sendRequest({
          method: 'POST',
          path: '/quick-successive-calls-with-errors'
        })
        .then(response => {
          expect(String(response)).to.equal('done');

          return retry(() =>
            agentControls.getSpans().then(spans => {
              const entrySpan = expectAtLeastOneMatching(spans, span => {
                expect(span.n).to.equal('node.http.server');
                expect(span.data.http.method).to.equal('POST');
              });

              expect(spans).to.have.lengthOf(3);

              expectExactlyOneMatching(spans, span => {
                expect(span.t).to.equal(entrySpan.t);
                expect(span.p).to.equal(entrySpan.s);
                expect(span.n).to.equal('redis');
                expect(span.k).to.equal(constants.EXIT);
                expect(span.f.e).to.equal(String(controls.getPid()));
                expect(span.f.h).to.equal('agent-stub-uuid');
                expect(span.ec).to.equal(2);
                // The get calls have errors, thus they should be more significant than the set call for batching.
                expect(span.data.redis.command).to.equal('get');

                expect(span.b).to.be.an('object');
                expect(span.b.s).to.equal(3);
                expect(span.b.d).to.be.greaterThan(0);

                expect(span.data.redis.error).to.be.a('string');
                expect(span.data.redis.error).to.contain("wrong number of arguments for 'get' command");
              });

              verifyHttpExit(controls, spans, entrySpan);
            })
          );
        }));
  }

  function verifyHttpExit(controls, spans, parent) {
    expectExactlyOneMatching(spans, span => {
      expect(span.t).to.equal(parent.t);
      expect(span.p).to.equal(parent.s);
      expect(span.n).to.equal('node.http.client');
      expect(span.k).to.equal(constants.EXIT);
      expect(span.f.e).to.equal(String(controls.getPid()));
      expect(span.f.h).to.equal('agent-stub-uuid');
      expect(span.async).to.not.exist;
      expect(span.error).to.not.exist;
      expect(span.ec).to.equal(0);
      expect(span.data.http.method).to.equal('GET');
      expect(span.data.http.url).to.match(/http:\/\/127\.0\.0\.1:3210/);
      expect(span.data.http.status).to.equal(200);
    });
  }
});
