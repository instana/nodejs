/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const expect = require('chai').expect;
const path = require('path');
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

// Please run this command on the root folder to start the redis instance:
// node bin/start-test-containers.js --redis
//
// Please set the environment variables to run the tests against azure redis cluster:
//    export AZURE_REDIS_CLUSTER=team-nodejs-redis-cluster-tekton.redis.cache.windows.net:6380
//    export AZURE_REDIS_CLUSTER_PWD=
['default', 'cluster'].forEach(setupType => {
  describe(`tracing/redis ${setupType}`, function () {
    ['redis', '@redis/client'].forEach(redisPkg => {
      describe(`require: ${redisPkg}`, function () {
        this.timeout(config.getTestTimeout() * 4);
        const agentControls = globalAgent.instance;

        ['latest', 'v3'].forEach(redisVersion => {
          let mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

          // NOTE: clustering was added in v4
          //       https://github.com/redis/node-redis/blob/master/CHANGELOG.md#v400---24-nov-2021
          if (redisVersion !== 'latest' && setupType === 'cluster') {
            mochaSuiteFn = describe.skip;
          }

          // NOTE: redis v3 does not support using @redis/client
          if (redisVersion !== 'latest' && redisPkg === '@redis/client') {
            mochaSuiteFn = describe.skip;
          }

          if (setupType !== 'cluster') {
            mochaSuiteFn('When allowRootExitSpan: true is set', function () {
              globalAgent.setUpCleanUpHooks();
              let controls;

              before(async () => {
                controls = new ProcessControls({
                  useGlobalAgent: true,
                  appPath: path.join(__dirname, 'allowRootExitSpanApp'),
                  env: {
                    REDIS_VERSION: redisVersion,
                    REDIS_PKG: redisPkg
                  }
                });

                await controls.start(null, null, true);
              });

              beforeEach(async () => {
                await agentControls.clearReceivedTraceData();
              });

              it('must trace exit span', async function () {
                return retry(async () => {
                  const spans = await agentControls.getSpans();

                  expect(spans.length).to.be.eql(1);

                  expectAtLeastOneMatching(spans, [
                    span => expect(span.n).to.equal('redis'),
                    span => expect(span.k).to.equal(2),
                    span => expect(span.p).to.not.exist
                  ]);
                });
              });
            });
          }

          mochaSuiteFn(`redis@${redisVersion}`, function () {
            globalAgent.setUpCleanUpHooks();
            let controls;

            before(async () => {
              controls = new ProcessControls({
                useGlobalAgent: true,
                appPath:
                  redisVersion === 'latest' ? path.join(__dirname, 'app.js') : path.join(__dirname, 'legacyApp.js'),
                env: {
                  REDIS_VERSION: redisVersion,
                  REDIS_PKG: redisPkg,
                  REDIS_CLUSTER: setupType === 'cluster'
                }
              });

              await controls.startAndWaitForAgentConnection(5000, Date.now() + 1000 * 60 * 5);
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
                        span => verifyConnection(setupType, span),
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
                        span => verifyConnection(setupType, span),
                        span => expect(span.data.redis.command).to.equal('get')
                      ]);

                      verifyHttpExit(controls, spans, writeEntrySpan);
                      verifyHttpExit(controls, spans, readEntrySpan);

                      // 2 x entry span
                      // 2 x redis exit span
                      // 2 x http exit span
                      expect(spans.length).to.eql(6);
                    })
                  );
                }));
            // TODO
            it.skip('should not create spans for ignored commands via ignoredEndpoints', async () => {
              const ignoreControls = new ProcessControls({
                useGlobalAgent: true,
                appPath:
                  redisVersion === 'latest' ? path.join(__dirname, 'app.js') : path.join(__dirname, 'legacyApp.js'),
                env: {
                  REDIS_VERSION: redisVersion,
                  REDIS_PKG: redisPkg,
                  REDIS_CLUSTER: setupType === 'cluster',
                  IGNORE_ENDPOINTS: true,
                  IGNORE_COMMANDS: JSON.stringify(['get', 'set'])
                }
              });

              await ignoreControls.startAndWaitForAgentConnection(5000, Date.now() + 1000 * 60 * 5);

              await ignoreControls
                .sendRequest({
                  method: 'POST',
                  path: '/values',
                  qs: {
                    key: 'price',
                    value: 42
                  }
                })
                .then(() =>
                  ignoreControls.sendRequest({
                    method: 'GET',
                    path: '/values',
                    qs: {
                      key: 'price'
                    }
                  })
                )
                .then(async response => {
                  expect(String(response)).to.equal('42');

                  return retry(async () => {
                    const spans = await agentControls.getSpans();
                    spans.forEach(span => {
                      expect(span.n).not.to.equal('redis');
                    });
                    expectAtLeastOneMatching(spans, [
                      span => expect(span.n).to.equal('node.http.server'),
                      span => expect(span.data.http.method).to.equal('POST')
                    ]);

                    expectAtLeastOneMatching(spans, [
                      span => expect(span.n).to.equal('node.http.server'),
                      span => expect(span.data.http.method).to.equal('GET')
                    ]);
                  });
                })
                .finally(async () => {
                  await ignoreControls.stop();
                });
            });

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
                        span => verifyConnection(setupType, span),
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
                        span => verifyConnection(setupType, span),
                        span =>
                          redisVersion === 'latest'
                            ? expect(span.data.redis.command).to.equal('hGetAll')
                            : expect(span.data.redis.command).to.equal('hget')
                      ]);

                      verifyHttpExit(controls, spans, entrySpan);

                      expect(spans.length).to.be.eql(4);
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

                      verifyHttpExit(controls, spans, writeEntrySpan);

                      // TODO: Why do we have less spans with the cluster?
                      if (setupType === 'cluster') {
                        expect(spans.length).to.be.eql(2);
                      } else {
                        expect(spans.length).to.be.eql(3);
                      }
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
                        span => verifyConnection(setupType, span),
                        span => expect(span.data.redis.command).to.equal('set')
                      ]);

                      verifyHttpExit(controls, spans, writeEntrySpan);

                      expect(spans.length).to.be.eql(3);
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

                      expect(spans.length).to.eql(3);

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
                        span => verifyConnection(setupType, span),
                        span => expect(span.data.redis.command).to.equal('get'),
                        span => expect(span.data.redis.error).to.be.a('string')
                      ]);

                      verifyHttpExit(controls, spans, writeEntrySpan);
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

                      expect(spans.length).to.be.eql(3);

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
                        span => verifyConnection(setupType, span),
                        span => expect(span.data.redis.command).to.equal('multi'),
                        span =>
                          redisVersion === 'latest'
                            ? expect(span.data.redis.subCommands).to.deep.equal(['SET', 'GET'])
                            : expect(span.data.redis.subCommands).to.deep.equal(['hset', 'hget'])
                      ]);

                      verifyHttpExit(controls, spans, writeEntrySpan);
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
                          span => verifyConnection(setupType, span),
                          span =>
                            redisVersion === 'v3'
                              ? expect(span.data.redis.error).to.contain(
                                  "ERR wrong number of arguments for 'hget' command"
                                )
                              : expect(span.data.redis.error).to.contain(
                                  'EXECABORT Transaction discarded because of previous errors.'
                                ),
                          span => expect(span.data.redis.command).to.equal('multi'),
                          span =>
                            redisVersion === 'latest'
                              ? expect(span.data.redis.subCommands).to.deep.equal(['SET', 'GET'])
                              : expect(span.data.redis.subCommands).to.deep.equal(['hset', 'hget'])
                        ]);

                        verifyHttpExit(controls, spans, writeEntrySpan);

                        expect(spans.length).to.be.eql(3);
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
                        span => verifyConnection(setupType, span),
                        span => expect(span.data.redis.command).to.equal('multi'),
                        span =>
                          redisVersion === 'latest'
                            ? expect(span.data.redis.subCommands).to.deep.equal(['SET', 'GET'])
                            : expect(span.data.redis.subCommands).to.deep.equal(['hset', 'hget'])
                      ]);

                      verifyHttpExit(controls, spans, writeEntrySpan);

                      expect(spans.length).to.be.eql(3);
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
                        span => verifyConnection(setupType, span),
                        span => expect(span.data.redis.command).to.equal('multi'),
                        span =>
                          redisVersion === 'latest'
                            ? expect(span.data.redis.subCommands).to.deep.equal(['SET', 'GET'])
                            : expect(span.data.redis.subCommands).to.deep.equal(['hset', 'hget'])
                      ]);

                      verifyHttpExit(controls, spans, writeEntrySpan);

                      expect(spans.length).to.be.eql(3);
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
                        span => verifyConnection(setupType, span),
                        span => expect(span.data.redis.command).to.equal('pipeline'),
                        span =>
                          redisVersion === 'latest'
                            ? expect(span.data.redis.subCommands).to.deep.equal(['GET', 'SET'])
                            : expect(span.data.redis.subCommands).to.deep.equal(['hset', 'hget'])
                      ]);

                      verifyHttpExit(controls, spans, writeEntrySpan);

                      expect(spans.length).to.be.eql(3);
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
                        span => verifyConnection(setupType, span),
                        span => expect(span.data.redis.command).to.equal('pipeline'),
                        span =>
                          redisVersion === 'latest'
                            ? expect(span.data.redis.subCommands).to.deep.equal(['GET', 'SET'])
                            : expect(span.data.redis.subCommands).to.deep.equal(['hset', 'hget'])
                      ]);

                      verifyHttpExit(controls, spans, writeEntrySpan);

                      expect(spans.length).to.be.eql(3);
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

                      verifyHttpExit(controls, spans, writeEntrySpan);
                      expect(spans.length).to.be.eql(4);
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
                          span => verifyConnection(setupType, span),
                          span => expect(span.data.redis.command).to.equal('hVals')
                        ]);

                        verifyHttpExit(controls, spans, entrySpan);

                        expect(spans.length).to.be.eql(3);
                      })
                    )
                  ));

              // scanIterator not available on cluster.
              if (setupType !== 'cluster') {
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
                            span => verifyConnection(setupType, span),
                            span => expect(span.data.redis.command).to.equal('get')
                          ]);

                          verifyHttpExit(controls, spans, entrySpan);
                        })
                      )
                    ));
              }

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
                          span => verifyConnection(setupType, span),
                          span => expect(span.data.redis.command).to.equal('blPop')
                        ]);

                        verifyHttpExit(controls, spans, entrySpan);

                        expect(spans.length).to.be.eql(4);
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

            // Does not make sense for cluster.
            if (setupType !== 'cluster') {
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
            }
          });
        });

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

        function verifyConnection(type, span) {
          if (type === 'cluster') {
            expect(span.data.redis.connection).to.contain(process.env.AZURE_REDIS_CLUSTER);
          } else {
            expect(span.data.redis.connection).to.contain(process.env.REDIS);
          }
        }
      });
    });
  });
});
