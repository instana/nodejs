/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const { retry, expectAtLeastOneMatching, expectExactlyOneMatching } = require('../../../../../core/test/test_util');

const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/redis', function() {
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

        return retry(() =>
          agentControls.getSpans().then(spans => {
            const writeEntrySpan = expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('POST')
            ]);

            expectAtLeastOneMatching(spans, [
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

            const readEntrySpan = expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET'),
              span => expect(span.f.e).to.equal(String(controls.getPid())),
              span => expect(span.f.h).to.equal('agent-stub-uuid')
            ]);

            expectAtLeastOneMatching(spans, [
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
            const writeEntrySpan = expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET')
            ]);

            expectAtLeastOneMatching(spans, [
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
            const writeEntrySpan = expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET')
            ]);

            expectAtLeastOneMatching(spans, [
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
            const writeEntrySpan = expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET')
            ]);

            expectAtLeastOneMatching(spans, [
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
              span => expect(span.data.redis.subCommands).to.deep.equal(['hset', 'hget'])
            ]);

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
            const writeEntrySpan = expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET')
            ]);

            expectAtLeastOneMatching(spans, [
              span => expect(span.t).to.equal(writeEntrySpan.t),
              span => expect(span.p).to.equal(writeEntrySpan.s),
              span => expect(span.n).to.equal('redis'),
              span => expect(span.k).to.equal(constants.EXIT),
              span => expect(span.f.e).to.equal(String(controls.getPid())),
              span => expect(span.f.h).to.equal('agent-stub-uuid'),
              span => expect(span.async).to.not.exist,
              span => expect(span.error).to.not.exist,
              span => expect(span.ec).to.equal(1),
              span => expect(span.b.s).to.equal(2),
              span => expect(span.b.u).to.not.exist,
              span => expect(span.data.redis.connection).to.equal(process.env.REDIS),
              span => expect(span.data.redis.command).to.equal('pipeline'),
              span => expect(span.data.redis.subCommands).to.deep.equal(['hset', 'hget'])
            ]);

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
            const writeEntrySpan = expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET')
            ]);

            expectAtLeastOneMatching(spans, [
              span => expect(span.t).to.equal(writeEntrySpan.t),
              span => expect(span.p).to.equal(writeEntrySpan.s),
              span => expect(span.n).to.equal('redis'),
              span => expect(span.k).to.equal(constants.EXIT),
              span => expect(span.data.redis.command).to.equal('set'),
              span => expect(span.f.e).to.equal(String(controls.getPid())),
              span => expect(span.f.h).to.equal('agent-stub-uuid')
            ]);

            expectAtLeastOneMatching(spans, [
              span => expect(span.t).to.equal(writeEntrySpan.t),
              span => expect(span.p).to.equal(writeEntrySpan.s),
              span => expect(span.n).to.equal('redis'),
              span => expect(span.data.redis.command).to.equal('get'),
              span => expect(span.f.e).to.equal(String(controls.getPid())),
              span => expect(span.f.h).to.equal('agent-stub-uuid')
            ]);

            verifyHttpExit(spans, writeEntrySpan);
          })
        )
      ));

  function verifyHttpExit(spans, parent) {
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
});
