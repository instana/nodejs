'use strict';

const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const testUtils = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/ioredis', function() {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  const controls = new ProcessControls({
    dirname: __dirname,
    useGlobalAgent: true
  });
  ProcessControls.setUpHooks(controls);

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

        return testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const writeEntrySpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('POST')
            ]);

            testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.t).to.equal(writeEntrySpan.t),
              span => expect(span.p).to.equal(writeEntrySpan.s),
              span => expect(span.n).to.equal('redis'),
              span => expect(span.k).to.equal(constants.EXIT),
              span => expect(span.f.e).to.equal(String(controls.getPid())),
              span => expect(span.f.h).to.equal('agent-stub-uuid'),
              span => expect(span.async).to.not.exist,
              span => expect(span.error).to.not.exist,
              span => expect(span.ec).to.equal(0),
              span => expect(span.data.redis.connection).to.equal(process.env.REDIS),
              span => expect(span.data.redis.command).to.equal('set')
            ]);

            const readEntrySpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET')
            ]);

            testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.t).to.equal(readEntrySpan.t),
              span => expect(span.p).to.equal(readEntrySpan.s),
              span => expect(span.n).to.equal('redis'),
              span => expect(span.k).to.equal(constants.EXIT),
              span => expect(span.f.e).to.equal(String(controls.getPid())),
              span => expect(span.f.h).to.equal('agent-stub-uuid'),
              span => expect(span.async).to.not.exist,
              span => expect(span.error).to.not.exist,
              span => expect(span.ec).to.equal(0),
              span => expect(span.data.redis.connection).to.equal(process.env.REDIS),
              span => expect(span.data.redis.command).to.equal('get')
            ]);
          })
        );
      }));

  it('must keep the tracing context', () =>
    controls
      .sendRequest({
        method: 'POST',
        path: '/values',
        qs: {
          key: 'keepTracing',
          value: 13
        }
      })
      .then(() =>
        controls.sendRequest({
          method: 'GET',
          path: '/keepTracing',
          qs: {
            key: 'keepTracing'
          }
        })
      )
      .then(response => {
        expect(String(response)).to.equal('OK;13');

        return testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const writeEntrySpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('POST')
            ]);

            testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.t).to.equal(writeEntrySpan.t),
              span => expect(span.p).to.equal(writeEntrySpan.s),
              span => expect(span.n).to.equal('redis'),
              span => expect(span.k).to.equal(constants.EXIT),
              span => expect(span.f.e).to.equal(String(controls.getPid())),
              span => expect(span.f.h).to.equal('agent-stub-uuid'),
              span => expect(span.async).to.not.exist,
              span => expect(span.error).to.not.exist,
              span => expect(span.ec).to.equal(0),
              span => expect(span.data.redis.connection).to.equal(process.env.REDIS),
              span => expect(span.data.redis.command).to.equal('set')
            ]);

            const readEntrySpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET')
            ]);

            testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.t).to.equal(readEntrySpan.t),
              span => expect(span.p).to.equal(readEntrySpan.s),
              span => expect(span.n).to.equal('redis'),
              span => expect(span.k).to.equal(constants.EXIT),
              span => expect(span.f.e).to.equal(String(controls.getPid())),
              span => expect(span.f.h).to.equal('agent-stub-uuid'),
              span => expect(span.async).to.not.exist,
              span => expect(span.error).to.not.exist,
              span => expect(span.ec).to.equal(0),
              span => expect(span.data.redis.connection).to.equal(process.env.REDIS),
              span => expect(span.data.redis.command).to.equal('get')
            ]);

            testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.t).to.equal(readEntrySpan.t),
              span => expect(span.p).to.equal(readEntrySpan.s),
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
          })
        );
      }));

  it('must keep the tracing context with ioredis via callback', () =>
    controls
      .sendRequest({
        method: 'POST',
        path: '/values',
        qs: {
          key: 'keepTracing',
          value: 13
        }
      })
      .then(() =>
        controls.sendRequest({
          method: 'GET',
          path: '/keepTracingCallback',
          qs: {
            key: 'keepTracing'
          }
        })
      )
      .then(response => {
        expect(String(response)).to.equal('OK;13');

        return testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const writeEntrySpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('POST')
            ]);

            testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.t).to.equal(writeEntrySpan.t),
              span => expect(span.p).to.equal(writeEntrySpan.s),
              span => expect(span.n).to.equal('redis'),
              span => expect(span.k).to.equal(constants.EXIT),
              span => expect(span.f.e).to.equal(String(controls.getPid())),
              span => expect(span.f.h).to.equal('agent-stub-uuid'),
              span => expect(span.async).to.not.exist,
              span => expect(span.error).to.not.exist,
              span => expect(span.ec).to.equal(0),
              span => expect(span.data.redis.connection).to.equal(process.env.REDIS),
              span => expect(span.data.redis.command).to.equal('set')
            ]);

            const readEntrySpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET')
            ]);

            testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.t).to.equal(readEntrySpan.t),
              span => expect(span.p).to.equal(readEntrySpan.s),
              span => expect(span.n).to.equal('redis'),
              span => expect(span.k).to.equal(constants.EXIT),
              span => expect(span.f.e).to.equal(String(controls.getPid())),
              span => expect(span.f.h).to.equal('agent-stub-uuid'),
              span => expect(span.async).to.not.exist,
              span => expect(span.error).to.not.exist,
              span => expect(span.ec).to.equal(0),
              span => expect(span.data.redis.connection).to.equal(process.env.REDIS),
              span => expect(span.data.redis.command).to.equal('get')
            ]);

            testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.t).to.equal(readEntrySpan.t),
              span => expect(span.p).to.equal(readEntrySpan.s),
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
        testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const writeEntrySpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET')
            ]);

            testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.t).to.equal(writeEntrySpan.t),
              span => expect(span.p).to.equal(writeEntrySpan.s),
              span => expect(span.n).to.equal('redis'),
              span => expect(span.k).to.equal(constants.EXIT),
              span => expect(span.f.e).to.equal(String(controls.getPid())),
              span => expect(span.f.h).to.equal('agent-stub-uuid'),
              span => expect(span.async).to.not.exist,
              span => expect(span.error).to.not.exist,
              span => expect(span.ec).to.equal(1),
              span => expect(span.data.redis.connection).to.equal(process.env.REDIS),
              span => expect(span.data.redis.command).to.equal('get'),
              span => expect(span.data.redis.error).to.be.a('string')
            ]);
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
        testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const writeEntrySpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET')
            ]);

            testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.t).to.equal(writeEntrySpan.t),
              span => expect(span.p).to.equal(writeEntrySpan.s),
              span => expect(span.n).to.equal('redis'),
              span => expect(span.k).to.equal(constants.EXIT),
              span => expect(span.f.e).to.equal(String(controls.getPid())),
              span => expect(span.f.h).to.equal('agent-stub-uuid'),
              span => expect(span.async).to.not.exist,
              span => expect(span.error).to.not.exist,
              span => expect(span.ec).to.equal(0),
              span => expect(span.b.s).to.equal(2),
              span => expect(span.b.u).to.not.exist,
              span => expect(span.data.redis.connection).to.equal(process.env.REDIS),
              span => expect(span.data.redis.command).to.equal('multi'),
              span => expect(span.data.redis.subCommands).to.deep.equal(['hset', 'hget'])
            ]);
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
        testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const writeEntrySpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET')
            ]);

            testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.t).to.equal(writeEntrySpan.t),
              span => expect(span.p).to.equal(writeEntrySpan.s),
              span => expect(span.n).to.equal('redis'),
              span => expect(span.k).to.equal(constants.EXIT),
              span => expect(span.f.e).to.equal(String(controls.getPid())),
              span => expect(span.f.h).to.equal('agent-stub-uuid'),
              span => expect(span.async).to.not.exist,
              span => expect(span.error).to.not.exist,
              span => expect(span.ec).to.equal(2),
              span => expect(span.b.s).to.equal(2),
              span => expect(span.b.u).to.not.exist,
              span => expect(span.data.redis.connection).to.equal(process.env.REDIS),
              span => expect(span.data.redis.command).to.equal('multi'),
              span => expect(span.data.redis.subCommands).to.deep.equal(['hset', 'hget']),
              span => expect(span.data.redis.error).to.be.a('string')
            ]);
          })
        )
      ));

  it('must keep the tracing context after multi', () =>
    controls
      .sendRequest({
        method: 'POST',
        path: '/multiKeepTracing'
      })
      .then(() =>
        testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const entrySpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('POST')
            ]);

            testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.t).to.equal(entrySpan.t),
              span => expect(span.p).to.equal(entrySpan.s),
              span => expect(span.n).to.equal('redis'),
              span => expect(span.k).to.equal(constants.EXIT),
              span => expect(span.f.e).to.equal(String(controls.getPid())),
              span => expect(span.f.h).to.equal('agent-stub-uuid'),
              span => expect(span.async).to.not.exist,
              span => expect(span.error).to.not.exist,
              span => expect(span.ec).to.equal(0),
              span => expect(span.b.s).to.equal(2),
              span => expect(span.b.u).to.not.exist,
              span => expect(span.data.redis.connection).to.equal(process.env.REDIS),
              span => expect(span.data.redis.command).to.equal('multi'),
              span => expect(span.data.redis.subCommands).to.deep.equal(['hset', 'hget'])
            ]);

            testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.t).to.equal(entrySpan.t),
              span => expect(span.p).to.equal(entrySpan.s),
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
          })
        )
      ));

  it('must trace pipeline calls', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/pipeline'
      })
      .then(() =>
        testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const writeEntrySpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET')
            ]);

            testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.t).to.equal(writeEntrySpan.t),
              span => expect(span.p).to.equal(writeEntrySpan.s),
              span => expect(span.n).to.equal('redis'),
              span => expect(span.k).to.equal(constants.EXIT),
              span => expect(span.f.e).to.equal(String(controls.getPid())),
              span => expect(span.f.h).to.equal('agent-stub-uuid'),
              span => expect(span.async).to.not.exist,
              span => expect(span.error).to.not.exist,
              span => expect(span.ec).to.equal(0),
              span => expect(span.b.s).to.equal(3),
              span => expect(span.b.u).to.not.exist,
              span => expect(span.data.redis.connection).to.equal(process.env.REDIS),
              span => expect(span.data.redis.command).to.equal('pipeline'),
              span => expect(span.data.redis.subCommands).to.deep.equal(['hset', 'hset', 'hget'])
            ]);
          })
        )
      ));

  it('must trace partially failed pipeline calls', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/pipelineFailure'
      })
      .then(() =>
        testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const writeEntrySpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET')
            ]);

            testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.t).to.equal(writeEntrySpan.t),
              span => expect(span.p).to.equal(writeEntrySpan.s),
              span => expect(span.n).to.equal('redis'),
              span => expect(span.k).to.equal(constants.EXIT),
              span => expect(span.f.e).to.equal(String(controls.getPid())),
              span => expect(span.f.h).to.equal('agent-stub-uuid'),
              span => expect(span.async).to.not.exist,
              span => expect(span.error).to.not.exist,
              span => expect(span.ec).to.equal(1),
              span => expect(span.b.s).to.equal(3),
              span => expect(span.b.u).to.not.exist,
              span => expect(span.data.redis.connection).to.equal(process.env.REDIS),
              span => expect(span.data.redis.command).to.equal('pipeline'),
              span => expect(span.data.redis.subCommands).to.deep.equal(['hset', 'hset', 'hget']),
              span => expect(span.data.redis.error).to.be.a('string')
            ]);
          })
        )
      ));

  it('must keep the tracing context after pipeline', () =>
    controls
      .sendRequest({
        method: 'POST',
        path: '/pipelineKeepTracing'
      })
      .then(() =>
        testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const entrySpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('POST')
            ]);

            testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.t).to.equal(entrySpan.t),
              span => expect(span.p).to.equal(entrySpan.s),
              span => expect(span.n).to.equal('redis'),
              span => expect(span.k).to.equal(constants.EXIT),
              span => expect(span.f.e).to.equal(String(controls.getPid())),
              span => expect(span.f.h).to.equal('agent-stub-uuid'),
              span => expect(span.async).to.not.exist,
              span => expect(span.error).to.not.exist,
              span => expect(span.ec).to.equal(0),
              span => expect(span.b.s).to.equal(2),
              span => expect(span.b.u).to.not.exist,
              span => expect(span.data.redis.connection).to.equal(process.env.REDIS),
              span => expect(span.data.redis.command).to.equal('pipeline'),
              span => expect(span.data.redis.subCommands).to.deep.equal(['hset', 'hget'])
            ]);

            testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.t).to.equal(entrySpan.t),
              span => expect(span.p).to.equal(entrySpan.s),
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
          })
        )
      ));
});
