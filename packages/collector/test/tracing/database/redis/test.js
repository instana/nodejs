/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const expect = require('chai').expect;
const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const {
  retry,
  delay,
  expectExactlyNMatching,
  expectAtLeastOneMatching,
  expectExactlyOneMatching,
  stringifyItems
} = require('../../../../../core/test/test_util');

const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');

describe('tracing/redis', function () {
  this.timeout(config.getTestTimeout());

  const agentControls = globalAgent.instance;

  ['latest', 'v3'].forEach(redisVersion => {
    const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

    mochaSuiteFn(`redis@${redisVersion}`, function () {
      globalAgent.setUpCleanUpHooks();
      let controls;

      before(async () => {
        controls = new ProcessControls({
          dirname: __dirname,
          useGlobalAgent: true,
          env: {
            REDIS_VERSION: redisVersion
          }
        });

        await controls.startAndWaitForAgentConnection();
      });

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });

      before(async () => {
        await controls.sendRequest({
          method: 'POST',
          path: '/clearkeys'
        });
      });

      after(async () => {
        await controls.stop();
      });

      afterEach(async () => {
        await controls.clearIpcMessages();
      });

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
                  span => expect(span.data.redis.connection).to.contain(process.env.REDIS),
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
                  span => expect(span.data.redis.connection).to.contain(process.env.REDIS),
                  span => expect(span.data.redis.command).to.equal('get')
                ]);

                verifyHttpExit(spans, writeEntrySpan);
                verifyHttpExit(spans, readEntrySpan);
              })
            );
          }));

      it('must trace hset/hget calls', () =>
        controls
          .sendRequest({
            method: 'GET',
            path: '/hset-hget'
          })
          .then(response => {
            expect(String(response)).to.equal('value1');

            return retry(() =>
              agentControls.getSpans().then(spans => {
                const entrySpan = expectAtLeastOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.server'),
                  span => expect(span.data.http.method).to.equal('GET')
                ]);

                expectAtLeastOneMatching(spans, [
                  span => expect(span.t).to.equal(entrySpan.t),
                  span => expect(span.p).to.equal(entrySpan.s),
                  span => expect(span.n).to.equal('redis'),
                  span => expect(span.k).to.equal(constants.EXIT),
                  span => expect(span.f.e).to.equal(String(controls.getPid())),
                  span => expect(span.f.h).to.equal('agent-stub-uuid'),
                  span => expect(span.async).to.not.exist,
                  span => expect(span.error).to.not.exist,
                  span => expect(span.ec).to.equal(0),
                  span => expect(span.data.redis.connection).to.contain(process.env.REDIS),
                  span =>
                    redisVersion === 'latest'
                      ? expect(span.data.redis.command).to.equal('hSet')
                      : expect(span.data.redis.command).to.equal('hset')
                ]);

                expectAtLeastOneMatching(spans, [
                  span => expect(span.t).to.equal(entrySpan.t),
                  span => expect(span.p).to.equal(entrySpan.s),
                  span => expect(span.n).to.equal('redis'),
                  span => expect(span.k).to.equal(constants.EXIT),
                  span => expect(span.f.e).to.equal(String(controls.getPid())),
                  span => expect(span.f.h).to.equal('agent-stub-uuid'),
                  span => expect(span.async).to.not.exist,
                  span => expect(span.error).to.not.exist,
                  span => expect(span.ec).to.equal(0),
                  span => expect(span.data.redis.connection).to.contain(process.env.REDIS),
                  span =>
                    redisVersion === 'latest'
                      ? expect(span.data.redis.command).to.equal('hGetAll')
                      : expect(span.data.redis.command).to.equal('hget')
                ]);

                verifyHttpExit(spans, entrySpan);
              })
            );
          }));

      it('must not trace get without waiting', () =>
        controls
          .sendRequest({
            method: 'GET',
            path: '/get-without-waiting',
            qs: {
              key: 'price'
            }
          })
          .then(() =>
            retry(() =>
              agentControls.getSpans().then(spans => {
                const writeEntrySpan = expectAtLeastOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.server'),
                  span => expect(span.data.http.method).to.equal('GET')
                ]);

                verifyHttpExit(spans, writeEntrySpan);
              })
            )
          ));

      it('must trace set without cb', () =>
        controls
          .sendRequest({
            method: 'GET',
            path: '/set-without-waiting',
            qs: {
              key: 'price',
              value: 42
            }
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
                  span => expect(span.data.redis.connection).to.contain(process.env.REDIS),
                  span => expect(span.data.redis.command).to.equal('set')
                ]);

                verifyHttpExit(spans, writeEntrySpan);
              })
            )
          ));

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
                  span => expect(span.data.redis.connection).to.contain(process.env.REDIS),
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
                  // contains two batched span
                  span => expect(span.b).to.be.an('object'),
                  span => expect(span.b.s).to.equal(2),
                  span => expect(span.b.u).to.not.exist,
                  span => expect(span.data.redis.connection).to.contain(process.env.REDIS),
                  span => expect(span.data.redis.command).to.equal('multi'),
                  span =>
                    redisVersion === 'latest'
                      ? expect(span.data.redis.subCommands).to.deep.equal(['SET', 'GET'])
                      : expect(span.data.redis.subCommands).to.deep.equal(['hset', 'hget'])
                ]);

                verifyHttpExit(spans, writeEntrySpan);
              })
            )
          ));

      if (redisVersion !== 'latest') {
        it('must trace multi calls with sub callbacks', () =>
          controls
            .sendRequest({
              method: 'GET',
              path: '/multi-sub-cb'
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
                    // contains two batched span
                    span => expect(span.b).to.be.an('object'),
                    span => expect(span.b.s).to.equal(2),
                    span => expect(span.b.u).to.not.exist,
                    span => expect(span.data.redis.connection).to.contain(process.env.REDIS),
                    span =>
                      redisVersion === 'v3'
                        ? expect(span.data.redis.error).to.contain("ERR wrong number of arguments for 'hget' command")
                        : expect(span.data.redis.error).to.contain(
                            'EXECABORT Transaction discarded because of previous errors.'
                          ),
                    span => expect(span.data.redis.command).to.equal('multi'),
                    span =>
                      redisVersion === 'latest'
                        ? expect(span.data.redis.subCommands).to.deep.equal(['SET', 'GET'])
                        : expect(span.data.redis.subCommands).to.deep.equal(['hset', 'hget'])
                  ]);

                  verifyHttpExit(spans, writeEntrySpan);
                })
              )
            ));
      }

      it('must trace multi calls without exec waiting', () =>
        controls
          .sendRequest({
            method: 'GET',
            path: '/multi-no-waiting'
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
                  span => expect(span.ec).to.equal(0),
                  span => expect(span.b).to.be.an('object'),
                  span => expect(span.b.s).to.equal(2),
                  span => expect(span.b.u).to.not.exist,
                  span => expect(span.data.redis.connection).to.contain(process.env.REDIS),
                  span => expect(span.data.redis.command).to.equal('multi'),
                  span =>
                    redisVersion === 'latest'
                      ? expect(span.data.redis.subCommands).to.deep.equal(['SET', 'GET'])
                      : expect(span.data.redis.subCommands).to.deep.equal(['hset', 'hget'])
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
                  span => expect(span.b).to.be.an('object'),
                  span => expect(span.b.s).to.equal(2),
                  span => expect(span.b.u).to.not.exist,
                  span => expect(span.data.redis.connection).to.contain(process.env.REDIS),
                  span => expect(span.data.redis.command).to.equal('multi'),
                  span =>
                    redisVersion === 'latest'
                      ? expect(span.data.redis.subCommands).to.deep.equal(['SET', 'GET'])
                      : expect(span.data.redis.subCommands).to.deep.equal(['hset', 'hget'])
                ]);

                verifyHttpExit(spans, writeEntrySpan);
              })
            )
          ));

      it('must trace batch calls', () =>
        controls
          .sendRequest({
            method: 'GET',
            path: '/batchSuccess'
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
                  span => expect(span.b).to.be.an('object'),
                  span => expect(span.b.s).to.equal(2),
                  span => expect(span.b.u).to.not.exist,
                  span => expect(span.data.redis.connection).to.contain(process.env.REDIS),
                  span => expect(span.data.redis.command).to.equal('pipeline'),
                  span =>
                    redisVersion === 'latest'
                      ? expect(span.data.redis.subCommands).to.deep.equal(['GET', 'SET'])
                      : expect(span.data.redis.subCommands).to.deep.equal(['hset', 'hget'])
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
                  span => expect(span.b).to.be.an('object'),
                  span => expect(span.b.s).to.equal(2),
                  span => expect(span.b.u).to.not.exist,
                  span => expect(span.data.redis.connection).to.contain(process.env.REDIS),
                  span => expect(span.data.redis.command).to.equal('pipeline'),
                  span =>
                    redisVersion === 'latest'
                      ? expect(span.data.redis.subCommands).to.deep.equal(['GET', 'SET'])
                      : expect(span.data.redis.subCommands).to.deep.equal(['hset', 'hget'])
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

      if (redisVersion === 'latest') {
        it('must trace hvals', () =>
          controls
            .sendRequest({
              method: 'GET',
              path: '/hvals'
            })
            .then(() =>
              retry(() =>
                agentControls.getSpans().then(spans => {
                  const entrySpan = expectAtLeastOneMatching(spans, [
                    span => expect(span.n).to.equal('node.http.server'),
                    span => expect(span.data.http.method).to.equal('GET')
                  ]);

                  expectAtLeastOneMatching(spans, [
                    span => expect(span.t).to.equal(entrySpan.t),
                    span => expect(span.p).to.equal(entrySpan.s),
                    span => expect(span.n).to.equal('redis'),
                    span => expect(span.k).to.equal(constants.EXIT),
                    span => expect(span.f.e).to.equal(String(controls.getPid())),
                    span => expect(span.f.h).to.equal('agent-stub-uuid'),
                    span => expect(span.async).to.not.exist,
                    span => expect(span.error).to.not.exist,
                    span => expect(span.ec).to.equal(0),
                    span => expect(span.data.redis.connection).to.contain(process.env.REDIS),
                    span => expect(span.data.redis.command).to.equal('hVals')
                  ]);

                  verifyHttpExit(spans, entrySpan);
                })
              )
            ));

        it('must trace scan iterator usage', () =>
          controls
            .sendRequest({
              method: 'GET',
              path: '/scan-iterator'
            })
            .then(() =>
              retry(() =>
                agentControls.getSpans().then(spans => {
                  const entrySpan = expectAtLeastOneMatching(spans, [
                    span => expect(span.n).to.equal('node.http.server'),
                    span => expect(span.data.http.method).to.equal('GET')
                  ]);

                  expectExactlyNMatching(spans, 4, [
                    span => expect(span.t).to.equal(entrySpan.t),
                    span => expect(span.p).to.equal(entrySpan.s),
                    span => expect(span.n).to.equal('redis'),
                    span => expect(span.k).to.equal(constants.EXIT),
                    span => expect(span.f.e).to.equal(String(controls.getPid())),
                    span => expect(span.f.h).to.equal('agent-stub-uuid'),
                    span => expect(span.async).to.not.exist,
                    span => expect(span.error).to.not.exist,
                    span => expect(span.ec).to.equal(0),
                    span => expect(span.data.redis.connection).to.contain(process.env.REDIS),
                    span => expect(span.data.redis.command).to.equal('get')
                  ]);

                  verifyHttpExit(spans, entrySpan);
                })
              )
            ));

        // See https://redis.js.org/#node-redis-usage-basic-example blocking commands
        it('blocking', () =>
          controls
            .sendRequest({
              method: 'GET',
              path: '/blocking'
            })
            .then(() =>
              retry(() =>
                agentControls.getSpans().then(spans => {
                  const entrySpan = expectAtLeastOneMatching(spans, [
                    span => expect(span.n).to.equal('node.http.server'),
                    span => expect(span.data.http.method).to.equal('GET')
                  ]);

                  expectAtLeastOneMatching(spans, [
                    span => expect(span.t).to.equal(entrySpan.t),
                    span => expect(span.p).to.equal(entrySpan.s),
                    span => expect(span.n).to.equal('redis'),
                    span => expect(span.k).to.equal(constants.EXIT),
                    span => expect(span.f.e).to.equal(String(controls.getPid())),
                    span => expect(span.f.h).to.equal('agent-stub-uuid'),
                    span => expect(span.async).to.not.exist,
                    span => expect(span.error).to.not.exist,
                    span => expect(span.ec).to.equal(0),
                    span => expect(span.data.redis.connection).to.contain(process.env.REDIS),
                    span => expect(span.data.redis.command).to.equal('blPop')
                  ]);

                  verifyHttpExit(spans, entrySpan);
                })
              )
            ));
      }

      it('[suppressed] should not trace', async function () {
        await controls.sendRequest({
          method: 'POST',
          path: '/values',
          qs: {
            key: 'price',
            value: 42
          },
          suppressTracing: true
        });

        await delay(1000);
        const spans = await agentControls.getSpans();
        if (spans.length > 0) {
          expect.fail(`Unexpected spans: ${stringifyItems(spans)}`);
        }
      });

      it('[suppressed] should not trace multi', async function () {
        await controls.sendRequest({
          method: 'GET',
          path: '/multi',
          suppressTracing: true
        });

        await delay(1000);
        const spans = await agentControls.getSpans();
        if (spans.length > 0) {
          expect.fail(`Unexpected spans: ${stringifyItems(spans)}`);
        }
      });

      it('call two different hosts', async () => {
        const response = await controls.sendRequest({
          method: 'POST',
          path: '/two-different-target-hosts',
          qs: {
            key: 'key',
            value1: 'value1',
            value2: 'value2'
          }
        });

        expect(response.response1).to.equal('OK');
        expect(response.response2).to.equal('OK');

        await retry(async () => {
          const spans = await agentControls.getSpans();
          const entrySpan = expectAtLeastOneMatching(spans, [
            span => expect(span.n).to.equal('node.http.server'),
            span => expect(span.data.http.method).to.equal('POST')
          ]);
          expectExactlyOneMatching(spans, [
            span => expect(span.t).to.equal(entrySpan.t),
            span => expect(span.p).to.equal(entrySpan.s),
            span => expect(span.n).to.equal('redis'),
            span => expect(span.data.redis.command).to.equal('set'),
            span => expect(span.data.redis.connection).to.contain('127.0.0.1')
          ]);
          expectExactlyOneMatching(spans, [
            span => expect(span.t).to.equal(entrySpan.t),
            span => expect(span.p).to.equal(entrySpan.s),
            span => expect(span.n).to.equal('redis'),
            span => expect(span.data.redis.command).to.equal('set'),
            span => expect(span.data.redis.connection).to.contain('localhost')
          ]);
        });
      });

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
  });
});
