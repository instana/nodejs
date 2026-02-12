/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const expect = require('chai').expect;
const path = require('path');
const semver = require('semver');
const constants = require('@_local/core').tracing.constants;
const supportedVersion = require('@_local/core').tracing.supportedVersion;
const config = require('@_local/core/test/config');
const {
  retry,
  delay,
  expectExactlyNMatching,
  expectAtLeastOneMatching,
  expectExactlyOneMatching,
  stringifyItems
} = require('@_local/core/test/test_util');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const globalAgent = require('@_local/collector/test/globalAgent');

// v3 is considered the legacy version.
// - It does not support Redis clustering.
// - It does not support the newer `@redis/client` package.
// Clustering support was officially introduced in v4
// Redis Sentinel support was added in v5.
const legacyVersion = '3';

/**
 * Supported Redis setups for local testing:
 *
 * 1. Standalone (Default):
 *    - Start a standalone Redis container with:
 *        node bin/start-test-containers.js --redis
 *
 * 2. Cluster:
 *    - To run tests against an Azure Redis Cluster, set the following environment variables:
 *        export AZURE_REDIS_CLUSTER=team-nodejs-redis-cluster-tekton.redis.cache.windows.net:6380
 *        export AZURE_REDIS_CLUSTER_PWD=<your_password_here>
 *
 *    - Credentials are available in 1Password. Search for: "Team Node.js: Azure Redis cluster"
 *
 * 3. Sentinel:
 *    - To run tests against Redis Sentinel, start Redis Sentinel setup (1 master, 1 slave, 1 sentinel) with:
 *        node bin/start-test-containers.js --redis --redis-slave --redis-sentinel
 */

module.exports = function (name, version, isLatest, mode) {
  const isDefaultMode = mode === 'default';
  const isLegacyMode = mode === 'defaultLegacy';
  const isCluster = mode === 'cluster';
  const isSentinel = mode === 'sentinel';

  if (isCluster && semver.major(version) < 4) {
    console.log(`Cluster not supported for version ${version}`);
    return;
  }

  if (isSentinel && semver.major(version) < 5) {
    console.log(`Sentinel not supported for version ${version}`);
    return;
  }

  const redisVersion = version;
  const isLegacyVersion = semver.major(redisVersion) <= legacyVersion;
  const isV4 = semver.major(redisVersion) === 4;
  const isV3 = semver.major(redisVersion) === 3;
  const greaterThanV4 = semver.major(redisVersion) > 4;


  this.timeout(config.getTestTimeout() * 4);
  const agentControls = globalAgent.instance;


  let mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

  // Legacy mode is only supported in Redis v4, skip tests for other versions
  if (isLegacyMode && !isV4) {
    mochaSuiteFn = describe.skip;
  }

  // The allowRootExitSpanApp is compatable with Redis v4 and v5 (latest).
  if (!isLegacyVersion && isLegacyMode) {
    mochaSuiteFn('When allowRootExitSpan: true is set', function () {
      globalAgent.setUpCleanUpHooks();
      let controls;

      before(async () => {
        controls = new ProcessControls({
          dirname: __dirname,
          useGlobalAgent: true,
          appName: 'allowRootExitSpanApp',
          env: {
            LIBRARY_LATEST: isLatest,
            LIBRARY_VERSION: version,
            LIBRARY_NAME: name,
            REDIS_SETUP_TYPE: mode
          }
        });

        await controls.start(null, null, true);
      });

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });

      after(async () => {
        await controls.stop();
      });

      afterEach(async () => {
        await controls.clearIpcMessages();
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
    // In v5, Redis moved "Isolation Pool" into RedisClientPool.
    // see: https://github.com/redis/node-redis/blob/master/docs/pool.md
    // Only for this test the connection is established via the pool.
    if (greaterThanV4 && isDefaultMode && !isLegacyMode) {
      mochaSuiteFn('When connected via clientpool', function () {
        globalAgent.setUpCleanUpHooks();
        let controls;

        before(async () => {
          controls = new ProcessControls({
            dirname: __dirname,
            useGlobalAgent: true,
            env: {
              LIBRARY_LATEST: isLatest,
              LIBRARY_VERSION: version,
              LIBRARY_NAME: name,
              REDIS_SETUP_TYPE: 'pool'
            }
          });

          await controls.startAndWaitForAgentConnection(5000, Date.now() + 1000 * 60 * 5);
        });

        beforeEach(async () => {
          await agentControls.clearReceivedTraceData();
        });

        after(async () => {
          await controls.stop();
        });

        afterEach(async () => {
          await controls.clearIpcMessages();
        });

        it('should trace blocking commands', () => testBlockingCommand(controls, mode));
      });
    }
  }

  mochaSuiteFn(`redis@${redisVersion}`, function () {
    globalAgent.setUpCleanUpHooks();
    let controls;

    before(async () => {
      controls = new ProcessControls({
        dirname: __dirname,
        useGlobalAgent: true,
        appName:
          isLegacyVersion ? 'legacyApp' : 'app',
        env: {
          LIBRARY_LATEST: isLatest,
          LIBRARY_VERSION: version,
          LIBRARY_NAME: name,
          REDIS_SETUP_TYPE: mode,
          REDIS_LEGACY_MODE: isLegacyMode
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

    if (isV4 && isLegacyMode) {
      it('must trace legacy mode', async () => {
        await controls.sendRequest({
          method: 'GET',
          path: '/legacy-mode'
        });

        return retry(() =>
          agentControls.getSpans().then(spans => {
            expect(spans.length).to.be.eql(2);

            expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('redis'),
              span => expect(span.k).to.equal(constants.EXIT),
              span => expect(span.f.e).to.equal(String(controls.getPid())),
              span => expect(span.f.h).to.equal('agent-stub-uuid'),
              span => expect(span.async).to.not.exist,
              span => expect(span.error).to.not.exist,
              span => expect(span.ec).to.equal(0),
              span => expect(span.d).to.be.gte(1)
            ]);
          })
        );
      });

      return;
    }

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
                span => verifyConnection(mode, span),
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
                span => verifyConnection(mode, span),
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
                span => verifyConnection(mode, span),
                span =>
                  isLegacyVersion
                    ? expect(span.data.redis.command).to.equal('hset')
                    : expect(span.data.redis.command).to.equal('hSet')
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
                span => verifyConnection(mode, span),
                span =>
                  isLegacyVersion
                    ? expect(span.data.redis.command).to.equal('hget')
                    : expect(span.data.redis.command).to.equal('hGetAll')
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
              if (mode === 'cluster') {
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
                span => verifyConnection(mode, span),
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
                span => verifyConnection(mode, span),
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
                span => verifyConnection(mode, span),
                span => expect(span.data.redis.command).to.equal('multi'),
                span =>
                  isLegacyVersion
                    ? expect(span.data.redis.subCommands).to.deep.equal(['hset', 'hget'])
                    : expect(span.data.redis.subCommands).to.deep.equal(['SET', 'GET'])
              ]);

              verifyHttpExit(controls, spans, writeEntrySpan);
            })
          )
        ));

    if (isLegacyVersion) {
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
                  span => verifyConnection(mode, span),
                  span =>
                    isV3
                      ? expect(span.data.redis.error).to.contain(
                        "ERR wrong number of arguments for 'hget' command"
                      )
                      : expect(span.data.redis.error).to.contain(
                        'EXECABORT Transaction discarded because of previous errors.'
                      ),
                  span => expect(span.data.redis.command).to.equal('multi'),
                  span =>
                    isLegacyVersion
                      ? expect(span.data.redis.subCommands).to.deep.equal(['hset', 'hget'])
                      : expect(span.data.redis.subCommands).to.deep.equal(['SET', 'GET'])
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
                span => verifyConnection(mode, span),
                span => expect(span.data.redis.command).to.equal('multi'),
                span =>
                  isLegacyVersion
                    ? expect(span.data.redis.subCommands).to.deep.equal(['hset', 'hget'])
                    : expect(span.data.redis.subCommands).to.deep.equal(['SET', 'GET'])
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
                span => verifyConnection(mode, span),
                span => expect(span.data.redis.command).to.equal('multi'),
                span =>
                  isLegacyVersion
                    ? expect(span.data.redis.subCommands).to.deep.equal(['hset', 'hget'])
                    : expect(span.data.redis.subCommands).to.deep.equal(['SET', 'GET'])
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
                span => verifyConnection(mode, span),
                span => expect(span.data.redis.command).to.equal('pipeline'),
                span =>
                  isLegacyVersion
                    ? expect(span.data.redis.subCommands).to.deep.equal(['hset', 'hget'])
                    : expect(span.data.redis.subCommands).to.deep.equal(['GET', 'SET'])
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
                span => verifyConnection(mode, span),
                span => expect(span.data.redis.command).to.equal('pipeline'),
                span =>
                  isLegacyVersion
                    ? expect(span.data.redis.subCommands).to.deep.equal(['hset', 'hget'])
                    : expect(span.data.redis.subCommands).to.deep.equal(['GET', 'SET'])
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

    if (!isLegacyVersion) {
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
                  span => verifyConnection(mode, span),
                  span => expect(span.data.redis.command).to.equal('hVals')
                ]);

                verifyHttpExit(controls, spans, entrySpan);

                expect(spans.length).to.be.eql(3);
              })
            )
          ));

      // scanIterator not available on cluster and sentinel
      if (mode === 'default') {
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
                  // NOTE: v5 SCAN iterators yield collection of keys, enabling multi-key commands like MGET.
                  // See: https://github.com/redis/node-redis/blob/master/docs/v4-to-v5.md#scan-iterators
                  const expectedSpanCount = greaterThanV4 ? 1 : 4;
                  const expectedRedisCommand = greaterThanV4 ? 'mGet' : 'get';

                  expectExactlyNMatching(spans, expectedSpanCount, [
                    span => expect(span.t).to.equal(entrySpan.t),
                    span => expect(span.p).to.equal(entrySpan.s),
                    span => expect(span.n).to.equal('redis'),
                    span => expect(span.k).to.equal(constants.EXIT),
                    span => expect(span.f.e).to.equal(String(controls.getPid())),
                    span => expect(span.f.h).to.equal('agent-stub-uuid'),
                    span => expect(span.async).to.not.exist,
                    span => expect(span.error).to.not.exist,
                    span => expect(span.ec).to.equal(0),
                    span => verifyConnection(mode, span),
                    span => expect(span.data.redis.command).to.equal(expectedRedisCommand)
                  ]);

                  verifyHttpExit(controls, spans, entrySpan);
                })
              )
            ));
      }

      // See https://redis.js.org/#node-redis-usage-basic-example blocking commands
      // The "Isolation Pool" was introduced via RedisClientPool in v5.
      // This new pool type requires a different connection mechanism.
      // As a result, this test is being skipped.
      if (!greaterThanV4) {
        it('blocking', () => testBlockingCommand(controls, mode));
      }
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

    // Does not make sense for cluster and sentinel
    if (mode === 'default') {
      it('multiple connections', async () => {
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

  mochaSuiteFn('ignore-endpoints:', function () {
    describe('when ignore-endpoints is enabled via agent configuration', () => {
      const { AgentStubControls } = require('../../../apps/agentStubControls');
      const customAgentControls = new AgentStubControls();
      let controls;

      before(async () => {
        await customAgentControls.startAgent({
          ignoreEndpoints: { redis: ['get', 'set'] }
        });

        controls = new ProcessControls({
          agentControls: customAgentControls,
          dirname: __dirname,
          appName:
            isLegacyVersion
              ? 'legacyApp'
              : 'app',
          env: {
            LIBRARY_LATEST: isLatest,
            LIBRARY_VERSION: version,
            LIBRARY_NAME: name,
            REDIS_SETUP_TYPE: mode
          }
        });
        await controls.startAndWaitForAgentConnection(5000, Date.now() + 1000 * 60 * 5);
      });

      beforeEach(async () => {
        await customAgentControls.clearReceivedTraceData();
      });

      after(async () => {
        await customAgentControls.stopAgent();
        await controls.stop();
      });

      it('should ignore redis spans for ignored endpoints (get, set)', async () => {
        await controls
          .sendRequest({
            method: 'POST',
            path: '/values',
            qs: {
              key: 'discount',
              value: 50
            }
          })
          .then(async () => {
            return retry(async () => {
              const spans = await customAgentControls.getSpans();
              // 1 x http entry span
              // 1 x http client span
              expect(spans.length).to.equal(2);
              spans.forEach(span => {
                expect(span.n).not.to.equal('redis');
              });
            });
          });
      });
    });

    describe('when ignore-endpoints is enabled via tracing config', async () => {
      globalAgent.setUpCleanUpHooks();
      let controls;

      before(async () => {
        controls = new ProcessControls({
          dirname: __dirname,
          useGlobalAgent: true,
          appName:
            isLegacyVersion
              ? 'legacyApp'
              : 'app',
          env: {
            LIBRARY_LATEST: isLatest,
            LIBRARY_VERSION: version,
            LIBRARY_NAME: name,
            REDIS_SETUP_TYPE: mode,
            INSTANA_IGNORE_ENDPOINTS: 'redis:get,set;'
          }
        });
        await controls.start();
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

      it('should ignore spans for configured ignore endpoints(get,set)', async function () {
        await controls
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
          .then(async response => {
            expect(String(response)).to.equal('42');

            return retry(async () => {
              const spans = await agentControls.getSpans();
              // 2 x http entry span
              // 2 x http client span
              expect(spans.length).to.equal(4);

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
          });
      });

      it('should not ignore spans for endpoints that are not in the ignore list', async () => {
        await controls
          .sendRequest({
            method: 'GET',
            path: '/hset-hget'
          })
          .then(async () => {
            return retry(async () => {
              const spans = await agentControls.getSpans();
              // 1 x http entry span
              // 1 x http client span
              // 1 x redis hSet span
              // 1 x redis hGetAll span
              expect(spans.length).to.equal(4);
              expect(spans.some(span => span.n === 'redis')).to.be.true;
            });
          });
      });
    });

    describe('(1) when env variable INSTANA_IGNORE_ENDPOINTS_PATH is used', async () => {
      globalAgent.setUpCleanUpHooks();
      let controls;

      before(async () => {
        controls = new ProcessControls({
          dirname: __dirname,
          useGlobalAgent: true,
          appName:
            isLegacyVersion
              ? 'legacyApp'
              : 'app',
          env: {
            LIBRARY_LATEST: isLatest,
            LIBRARY_VERSION: version,
            LIBRARY_NAME: name,
            REDIS_SETUP_TYPE: mode,
            INSTANA_IGNORE_ENDPOINTS_PATH: path.join(__dirname, 'files', 'tracing.yaml')
          }
        });
        await controls.start();
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

      it('should ignore spans for configured ignore endpoints(get,set)', async function () {
        await controls
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
          .then(async response => {
            expect(String(response)).to.equal('42');

            return retry(async () => {
              const spans = await agentControls.getSpans();
              // 2 x http entry span
              // 2 x http client span
              expect(spans.length).to.equal(4);

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
          });
      });
    });

    // NOTE: cluster & sentinel have currently no support for multiple connections
    if (mode !== 'cluster' && mode !== 'sentinel') {
      describe('(2) when env variable INSTANA_IGNORE_ENDPOINTS_PATH is used', async () => {
        globalAgent.setUpCleanUpHooks();
        let controls;

        before(async () => {
          controls = new ProcessControls({
            dirname: __dirname,
            useGlobalAgent: true,
            appName:
              isLegacyVersion
                ? 'legacyApp'
                : 'app',
            env: {
              LIBRARY_LATEST: isLatest,
              LIBRARY_VERSION: version,
              LIBRARY_NAME: name,
              REDIS_SETUP_TYPE: mode,
              INSTANA_IGNORE_ENDPOINTS_PATH: path.join(__dirname, 'files', 'tracing2.yaml')
            }
          });
          await controls.start();
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

        it('should ignore connection', async () => {
          const response = await controls.sendRequest({
            method: 'POST',
            path: '/two-different-target-hosts',
            qs: {
              key: 'key',
              value1: 'value1',
              value2: 'value2'
            }
          });

          // both connections successfully executed
          expect(response.response1).to.equal('OK');
          expect(response.response2).to.equal('OK');

          // wait to avoid false positive
          await delay(5000);

          return retry(async () => {
            const spans = await agentControls.getSpans();
            // 1 x http entry span
            // 1 x redis set span
            expect(spans.length).to.equal(2);
          });
        });
      });
    }
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
    } else if (type === 'sentinel') {
      expect(span.data.redis.connection).to.contain(process.env.REDIS_SENTINEL_HOST);
    } else {
      expect(span.data.redis.connection).to.contain(process.env.REDIS);
    }
  }

  function testBlockingCommand(controls, setupTypes) {
    return controls.sendRequest({ method: 'GET', path: '/blocking' }).then(() =>
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
            span => verifyConnection(setupTypes, span),
            span => expect(span.data.redis.command).to.equal('blPop')
          ]);

          verifyHttpExit(controls, spans, entrySpan);
          expect(spans.length).to.equal(4);
        })
      )
    );
  }
}

