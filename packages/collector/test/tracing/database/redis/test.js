'use strict';

const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const { retry, expectAtLeastOneMatching, expectExactlyOneMatching } = require('../../../../../core/test/test_util');

const ProcessControls = require('../../../test_util/ProcessControls');

describe('tracing/redis', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  const agentControls = require('../../../apps/agentStubControls');

  this.timeout(config.getTestTimeout());

  agentControls.registerTestHooks();

  const controls = new ProcessControls({
    dirname: __dirname,
    agentControls
  }).registerTestHooks();

  it('must trace set/get calls', () =>
    controls
      .sendRequest({
        method: 'POST',
        path: '/values',
        qs: {
          key: 'price',
          value: 42
        }
      })
      .then(() =>
        controls.sendRequest({
          method: 'GET',
          path: '/values',
          qs: {
            key: 'price'
          }
        })
      )
      .then(response => {
        expect(String(response)).to.equal('42');

        return retry(() =>
          agentControls.getSpans().then(spans => {
            const writeEntrySpan = expectAtLeastOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('POST');
            });

            expectAtLeastOneMatching(spans, span => {
              expect(span.t).to.equal(writeEntrySpan.t);
              expect(span.p).to.equal(writeEntrySpan.s);
              expect(span.n).to.equal('redis');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.f.e).to.equal(String(controls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
              expect(span.data.redis.connection).to.equal(process.env.REDIS);
              expect(span.data.redis.command).to.equal('set');
            });

            const readEntrySpan = expectAtLeastOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('GET');
              expect(span.f.e).to.equal(String(controls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
            });

            expectAtLeastOneMatching(spans, span => {
              expect(span.t).to.equal(readEntrySpan.t);
              expect(span.p).to.equal(readEntrySpan.s);
              expect(span.n).to.equal('redis');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.f.e).to.equal(String(controls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
              expect(span.data.redis.connection).to.equal(process.env.REDIS);
              expect(span.data.redis.command).to.equal('get');
            });

            verifyHttpExit(spans, writeEntrySpan);
            verifyHttpExit(spans, readEntrySpan);
          })
        );
      }));

  it('must trace failed redis calls', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/failure'
      })
      .catch(() => {
        // ignore errors
      })
      .then(() =>
        retry(() =>
          agentControls.getSpans().then(spans => {
            const writeEntrySpan = expectAtLeastOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('GET');
            });

            expectAtLeastOneMatching(spans, span => {
              expect(span.t).to.equal(writeEntrySpan.t);
              expect(span.p).to.equal(writeEntrySpan.s);
              expect(span.n).to.equal('redis');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.f.e).to.equal(String(controls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(1);
              expect(span.data.redis.connection).to.equal(process.env.REDIS);
              expect(span.data.redis.command).to.equal('get');
              expect(span.data.redis.error).to.be.a('string');
            });

            verifyHttpExit(spans, writeEntrySpan);
          })
        )
      ));

  it('must trace multi calls', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/multi'
      })
      .then(() =>
        retry(() =>
          agentControls.getSpans().then(spans => {
            const writeEntrySpan = expectAtLeastOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('GET');
            });

            expectAtLeastOneMatching(spans, span => {
              expect(span.t).to.equal(writeEntrySpan.t);
              expect(span.p).to.equal(writeEntrySpan.s);
              expect(span.n).to.equal('redis');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.f.e).to.equal(String(controls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
              expect(span.b.s).to.equal(2);
              expect(span.b.u).to.not.exist;
              expect(span.data.redis.connection).to.equal(process.env.REDIS);
              expect(span.data.redis.command).to.equal('multi');
              expect(span.data.redis.subCommands).to.deep.equal(['hset', 'hget']);
            });

            verifyHttpExit(spans, writeEntrySpan);
          })
        )
      ));

  it('must trace failed multi calls', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/multiFailure'
      })
      .catch(() => {
        // ignore errors
      })
      .then(() =>
        retry(() =>
          agentControls.getSpans().then(spans => {
            const writeEntrySpan = expectAtLeastOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('GET');
            });

            expectAtLeastOneMatching(spans, span => {
              expect(span.t).to.equal(writeEntrySpan.t);
              expect(span.p).to.equal(writeEntrySpan.s);
              expect(span.n).to.equal('redis');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.f.e).to.equal(String(controls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(2);
              expect(span.b.s).to.equal(2);
              expect(span.b.u).to.not.exist;
              expect(span.data.redis.connection).to.equal(process.env.REDIS);
              expect(span.data.redis.command).to.equal('multi');
              expect(span.data.redis.subCommands).to.deep.equal(['hset', 'hget']);
            });

            verifyHttpExit(spans, writeEntrySpan);
          })
        )
      ));

  it('must trace failed batch calls', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/batchFailure'
      })
      .catch(() => {
        // ignore errors
      })
      .then(() =>
        retry(() =>
          agentControls.getSpans().then(spans => {
            const writeEntrySpan = expectAtLeastOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('GET');
            });

            expectAtLeastOneMatching(spans, span => {
              expect(span.t).to.equal(writeEntrySpan.t);
              expect(span.p).to.equal(writeEntrySpan.s);
              expect(span.n).to.equal('redis');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.f.e).to.equal(String(controls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(1);
              expect(span.b.s).to.equal(2);
              expect(span.b.u).to.not.exist;
              expect(span.data.redis.connection).to.equal(process.env.REDIS);
              expect(span.data.redis.command).to.equal('pipeline');
              expect(span.data.redis.subCommands).to.deep.equal(['hset', 'hget']);
            });

            verifyHttpExit(spans, writeEntrySpan);
          })
        )
      ));

  it('must trace call sequences', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/callSequence'
      })
      .then(() =>
        retry(() =>
          agentControls.getSpans().then(spans => {
            const writeEntrySpan = expectAtLeastOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('GET');
            });

            expectAtLeastOneMatching(spans, span => {
              expect(span.t).to.equal(writeEntrySpan.t);
              expect(span.p).to.equal(writeEntrySpan.s);
              expect(span.n).to.equal('redis');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.data.redis.command).to.equal('set');
              expect(span.f.e).to.equal(String(controls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
            });

            expectAtLeastOneMatching(spans, span => {
              expect(span.t).to.equal(writeEntrySpan.t);
              expect(span.p).to.equal(writeEntrySpan.s);
              expect(span.n).to.equal('redis');
              expect(span.data.redis.command).to.equal('get');
              expect(span.f.e).to.equal(String(controls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
            });

            verifyHttpExit(spans, writeEntrySpan);
          })
        )
      ));

  function verifyHttpExit(spans, parent) {
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
