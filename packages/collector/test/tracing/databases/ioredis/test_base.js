/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const expect = require('chai').expect;

const constants = require('@_local/core').tracing.constants;
const {
  delay,
  expectExactlyOneMatching,
  expectAtLeastOneMatching,
  retry,
  stringifyItems
} = require('@_local/core/test/test_util');
const config = require('@_local/core/test/config');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const globalAgent = require('@_local/collector/test/globalAgent');
const expectExactlyNMatching = require('@_local/core/test/test_util/expectExactlyNMatching');

function checkConnection(span, setupType) {
  if (setupType === 'cluster') {
    expect(span.data.redis.connection).to.exist;
  } else {
    expect(span.data.redis.connection).to.equal(process.env.REDIS);
  }
}

module.exports = function (name, version, isLatest, setupType) {
  // Please run this command on the root folder to start the single redis instance (default):
  // node bin/start-test-containers.js --redis
  //
  // Please set the environment variables to run the tests against azure redis cluster:
  //    export AZURE_REDIS_CLUSTER=team-nodejs-redis-cluster-tekton.redis.cache.windows.net:6380
  //    export AZURE_REDIS_CLUSTER_PWD=

  // TODO: Add test for cluster mode https://jsw.ibm.com/browse/INSTA-15876
  if (setupType !== 'cluster') {
    describe('when allowRootExitSpan: true is set', function () {
        this.timeout(config.getTestTimeout() * 4);

        globalAgent.setUpCleanUpHooks();
        const agentControls = globalAgent.instance;
        let controls;

        before(async () => {
          controls = new ProcessControls({
            dirname: __dirname,
            appName: 'allowRootExitSpanApp.js',
            useGlobalAgent: true,
            env: {
              LIBRARY_LATEST: isLatest,
              LIBRARY_VERSION: version,
              LIBRARY_NAME: name,
              REDIS_CLUSTER: false
            }
          });

          await controls.start(null, null, true);
        });

        beforeEach(async () => {
          await agentControls.clearReceivedTraceData();
        });

        afterEach(async () => {
          await controls.clearIpcMessages();
        });

        it('must trace exit span', async function () {
          return retry(async () => {
            const spans = await agentControls.getSpans();

            // NO entry
            // 1 x multi containing the sub commands
            // 1 x exec span
            // 2 x sub commands
            expect(spans.length).to.be.eql(4);

            expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('redis'),
              span => expect(span.k).to.equal(2),
              span => expect(span.p).to.not.exist
            ]);
          });
        });
      });
    }

    describe(`${setupType}`, function () {
      this.timeout(config.getTestTimeout() * 4);

      globalAgent.setUpCleanUpHooks();
      const agentControls = globalAgent.instance;
      let controls;

      before(async () => {
        controls = new ProcessControls({
          dirname: __dirname,
          useGlobalAgent: true,
          env: {
            LIBRARY_LATEST: isLatest,
            LIBRARY_VERSION: version,
            LIBRARY_NAME: name,
            REDIS_CLUSTER: setupType === 'cluster'
          }
        });

        await controls.startAndWaitForAgentConnection(5000, Date.now() + 10000);
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

                expect(spans).to.have.lengthOf(4);

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
                  span => checkConnection(span, setupType),
                  span => expect(span.data.redis.command).to.equal('set')
                ]);

                const readEntrySpan = expectAtLeastOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.server'),
                  span => expect(span.data.http.method).to.equal('GET')
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
                  span => checkConnection(span, setupType),
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
            expect(String(response)).to.equal('13');

            return retry(() =>
              agentControls.getSpans().then(spans => {
                const writeEntrySpan = expectAtLeastOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.server'),
                  span => expect(span.data.http.method).to.equal('POST')
                ]);

                expect(spans).to.have.lengthOf(5);

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
                  span => checkConnection(span, setupType),
                  span => expect(span.data.redis.command).to.equal('set')
                ]);

                const readEntrySpan = expectAtLeastOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.server'),
                  span => expect(span.data.http.method).to.equal('GET')
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
                  span => checkConnection(span, setupType),
                  span => expect(span.data.redis.command).to.equal('get')
                ]);

                expectAtLeastOneMatching(spans, [
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
            expect(String(response)).to.equal('13');

            return retry(() =>
              agentControls.getSpans().then(spans => {
                const writeEntrySpan = expectAtLeastOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.server'),
                  span => expect(span.data.http.method).to.equal('POST')
                ]);

                expect(spans).to.have.lengthOf(5);

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
                  span => checkConnection(span, setupType),
                  span => expect(span.data.redis.command).to.equal('set')
                ]);

                const readEntrySpan = expectAtLeastOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.server'),
                  span => expect(span.data.http.method).to.equal('GET')
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
                  span => checkConnection(span, setupType),
                  span => expect(span.data.redis.command).to.equal('get')
                ]);

                expectAtLeastOneMatching(spans, [
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
            retry(() =>
              agentControls.getSpans().then(spans => {
                const writeEntrySpan = expectAtLeastOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.server'),
                  span => expect(span.data.http.method).to.equal('GET')
                ]);

                expect(spans.length).to.equal(2);

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
                  span => checkConnection(span, setupType),
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
            retry(() =>
              agentControls.getSpans().then(spans => {
                const writeEntrySpan = expectAtLeastOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.server'),
                  span => expect(span.data.http.method).to.equal('GET')
                ]);

                if (setupType === 'cluster') {
                  expect(spans.length).to.equal(4);
                } else {
                  expect(spans.length).to.equal(5);
                }

                if (setupType !== 'cluster') {
                  const multiSpan = expectAtLeastOneMatching(spans, [
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
                    span => checkConnection(span, setupType),
                    span => expect(span.data.redis.command).to.equal('multi'),
                    span => expect(span.data.redis.subCommands).to.deep.equal(['hset', 'hget'])
                  ]);

                  expectAtLeastOneMatching(spans, [
                    span => expect(span.t).to.equal(writeEntrySpan.t),
                    span => expect(span.p).to.equal(multiSpan.s),
                    span => expect(span.n).to.equal('redis'),
                    span => expect(span.k).to.equal(constants.EXIT),
                    span => expect(span.data.redis.command).to.equal('exec')
                  ]);
                  expectAtLeastOneMatching(spans, [
                    span => expect(span.t).to.equal(writeEntrySpan.t),
                    span => expect(span.p).to.equal(multiSpan.s),
                    span => expect(span.n).to.equal('redis'),
                    span => expect(span.data.redis.command).to.equal('hset')
                  ]);
                  expectAtLeastOneMatching(spans, [
                    span => expect(span.t).to.equal(writeEntrySpan.t),
                    span => expect(span.p).to.equal(multiSpan.s),
                    span => expect(span.n).to.equal('redis'),
                    span => expect(span.data.redis.command).to.equal('hget')
                  ]);
                } else {
                  expectAtLeastOneMatching(spans, [
                    span => expect(span.n).to.equal('redis'),
                    span => expect(span.data.redis.command).to.equal('exec')
                  ]);
                  expectAtLeastOneMatching(spans, [
                    span => expect(span.n).to.equal('redis'),
                    span => expect(span.data.redis.command).to.equal('hset')
                  ]);
                  expectAtLeastOneMatching(spans, [
                    span => expect(span.n).to.equal('redis'),
                    span => expect(span.data.redis.command).to.equal('hget')
                  ]);
                }
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

                if (setupType === 'cluster') {
                  expect(spans).to.have.lengthOf(4);
                } else {
                  expect(spans).to.have.lengthOf(5);
                }

                if (setupType !== 'cluster') {
                  const multiSpan = expectAtLeastOneMatching(spans, [
                    span => expect(span.t).to.equal(writeEntrySpan.t),
                    span => expect(span.p).to.equal(writeEntrySpan.s),
                    span => expect(span.n).to.equal('redis'),
                    span => expect(span.k).to.equal(constants.EXIT),
                    span => expect(span.ec).to.equal(2),
                    span => expect(span.b.s).to.equal(2),
                    span => expect(span.data.redis.command).to.equal('multi'),
                    span => expect(span.data.redis.subCommands).to.deep.equal(['hset', 'hget']),
                    span => expect(span.data.redis.error).to.be.a('string')
                  ]);

                  expectAtLeastOneMatching(spans, [
                    span => expect(span.p).to.equal(multiSpan.s),
                    span => expect(span.n).to.equal('redis'),
                    span => expect(span.ec).to.equal(1),
                    span => expect(span.data.redis.command).to.equal('exec')
                  ]);
                  expectAtLeastOneMatching(spans, [
                    span => expect(span.p).to.equal(multiSpan.s),
                    span => expect(span.n).to.equal('redis'),
                    span => expect(span.ec).to.equal(0),
                    span => expect(span.data.redis.command).to.equal('hset')
                  ]);
                  expectAtLeastOneMatching(spans, [
                    span => expect(span.p).to.equal(multiSpan.s),
                    span => expect(span.n).to.equal('redis'),
                    span => expect(span.ec).to.equal(1),
                    span => expect(span.data.redis.command).to.equal('hget')
                  ]);
                } else {
                  expectAtLeastOneMatching(spans, [
                    span => expect(span.n).to.equal('redis'),
                    span => expect(span.data.redis.command).to.equal('hset')
                  ]);
                  expectAtLeastOneMatching(spans, [
                    span => expect(span.n).to.equal('redis'),
                    span => expect(span.ec).to.equal(1),
                    span => expect(span.data.redis.command).to.equal('hget')
                  ]);
                  expectAtLeastOneMatching(spans, [
                    span => expect(span.n).to.equal('redis'),
                    span => expect(span.ec).to.equal(1),
                    span => expect(span.data.redis.command).to.equal('exec')
                  ]);
                }
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
            retry(() =>
              agentControls.getSpans().then(spans => {
                const entrySpan = expectAtLeastOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.server'),
                  span => expect(span.data.http.method).to.equal('POST')
                ]);

                if (setupType === 'cluster') {
                  expect(spans).to.have.lengthOf(5);
                } else {
                  expect(spans).to.have.lengthOf(6);
                }

                expectAtLeastOneMatching(spans, [
                  span => expect(span.t).to.equal(entrySpan.t),
                  span => expect(span.p).to.equal(entrySpan.s),
                  span => expect(span.n).to.equal('node.http.client'),
                  span => expect(span.k).to.equal(constants.EXIT),
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
            retry(() =>
              agentControls.getSpans().then(spans => {
                const writeEntrySpan = expectAtLeastOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.server'),
                  span => expect(span.data.http.method).to.equal('GET')
                ]);

                if (setupType === 'cluster') {
                  expect(spans).to.have.lengthOf(4);
                } else {
                  expect(spans).to.have.lengthOf(5);
                }

                if (setupType !== 'cluster') {
                  const pipelineSpan = expectAtLeastOneMatching(spans, [
                    span => expect(span.t).to.equal(writeEntrySpan.t),
                    span => expect(span.p).to.equal(writeEntrySpan.s),
                    span => expect(span.n).to.equal('redis'),
                    span => expect(span.k).to.equal(constants.EXIT),
                    span => expect(span.ec).to.equal(0),
                    span => expect(span.b.s).to.equal(3),
                    span => expect(span.data.redis.command).to.equal('pipeline'),
                    span => expect(span.data.redis.subCommands).to.deep.equal(['hset', 'hset', 'hget'])
                  ]);

                  expectAtLeastOneMatching(spans, [
                    span => expect(span.p).to.equal(pipelineSpan.s),
                    span => expect(span.n).to.equal('redis'),
                    span => expect(span.data.redis.command).to.equal('hget')
                  ]);
                  expectExactlyNMatching(spans, 2, [
                    span => expect(span.p).to.equal(pipelineSpan.s),
                    span => expect(span.n).to.equal('redis'),
                    span => expect(span.data.redis.command).to.equal('hset')
                  ]);
                } else {
                  expectAtLeastOneMatching(spans, [
                    span => expect(span.n).to.equal('redis'),
                    span => expect(span.data.redis.command).to.equal('hget')
                  ]);
                  expectAtLeastOneMatching(spans, [
                    span => expect(span.n).to.equal('redis'),
                    span => expect(span.data.redis.command).to.equal('hset')
                  ]);
                }
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
            retry(() =>
              agentControls.getSpans().then(spans => {
                const writeEntrySpan = expectAtLeastOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.server'),
                  span => expect(span.data.http.method).to.equal('GET')
                ]);

                if (setupType === 'cluster') {
                  expect(spans).to.have.lengthOf(4);
                } else {
                  expect(spans).to.have.lengthOf(5);
                }

                if (setupType !== 'cluster') {
                  const pipelineSpan = expectAtLeastOneMatching(spans, [
                    span => expect(span.t).to.equal(writeEntrySpan.t),
                    span => expect(span.p).to.equal(writeEntrySpan.s),
                    span => expect(span.n).to.equal('redis'),
                    span => expect(span.ec).to.equal(1),
                    span => expect(span.b.s).to.equal(3),
                    span => expect(span.data.redis.command).to.equal('pipeline'),
                    span => expect(span.data.redis.error).to.be.a('string')
                  ]);

                  expectAtLeastOneMatching(spans, [
                    span => expect(span.p).to.equal(pipelineSpan.s),
                    span => expect(span.n).to.equal('redis'),
                    span => expect(span.ec).to.equal(1),
                    span => expect(span.data.redis.command).to.equal('hset'),
                    span => expect(span.data.redis.error).to.exist
                  ]);
                  expectAtLeastOneMatching(spans, [
                    span => expect(span.p).to.equal(pipelineSpan.s),
                    span => expect(span.n).to.equal('redis'),
                    span => expect(span.ec).to.equal(0),
                    span => expect(span.data.redis.command).to.equal('hset')
                  ]);
                  expectAtLeastOneMatching(spans, [
                    span => expect(span.p).to.equal(pipelineSpan.s),
                    span => expect(span.n).to.equal('redis'),
                    span => expect(span.data.redis.command).to.equal('hget')
                  ]);
                } else {
                  expectAtLeastOneMatching(spans, [
                    span => expect(span.n).to.equal('redis'),
                    span => expect(span.ec).to.equal(1),
                    span => expect(span.data.redis.command).to.equal('hset')
                  ]);
                  expectAtLeastOneMatching(spans, [
                    span => expect(span.n).to.equal('redis'),
                    span => expect(span.data.redis.command).to.equal('hget')
                  ]);
                  expectAtLeastOneMatching(spans, [
                    span => expect(span.n).to.equal('redis'),
                    span => expect(span.data.redis.command).to.equal('hset')
                  ]);
                }
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
            retry(() =>
              agentControls.getSpans().then(spans => {
                const entrySpan = expectAtLeastOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.server'),
                  span => expect(span.data.http.method).to.equal('POST')
                ]);

                if (setupType === 'cluster') {
                  expect(spans).to.have.lengthOf(4);
                } else {
                  expect(spans).to.have.lengthOf(5);
                }

                expectAtLeastOneMatching(spans, [
                  span => expect(span.t).to.equal(entrySpan.t),
                  span => expect(span.p).to.equal(entrySpan.s),
                  span => expect(span.n).to.equal('node.http.client'),
                  span => expect(span.k).to.equal(constants.EXIT),
                  span => expect(span.data.http.method).to.equal('GET'),
                  span => expect(span.data.http.url).to.match(/http:\/\/127\.0\.0\.1:/),
                  span => expect(span.data.http.status).to.equal(200)
                ]);
              })
            )
          ));

      it('[suppressed] should not trace pipeline', async function () {
        await controls.sendRequest({
          method: 'GET',
          path: '/pipeline',
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

      if (setupType !== 'cluster') {
        it('call two different hosts/clients', async () => {
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

            expect(spans).to.have.lengthOf(3);

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

    describe('ignore-endpoints', function () {
      this.timeout(config.getTestTimeout());

      describe('when ignore-endpoints is enabled via agent configuration', () => {
        const { AgentStubControls } = require('@_local/collector/test/apps/agentStubControls');
        const customAgentControls = new AgentStubControls();
        let controls;

        before(async () => {
          await customAgentControls.startAgent({
            ignoreEndpoints: { redis: ['get', 'set'] }
          });

          controls = new ProcessControls({
            agentControls: customAgentControls,
            dirname: __dirname,
            env: {
              LIBRARY_LATEST: isLatest,
              LIBRARY_VERSION: version,
              LIBRARY_NAME: name
            }
          });
          await controls.startAndWaitForAgentConnection();
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
                expect(spans.length).to.equal(1);
                spans.forEach(span => {
                  expect(span.n).not.to.equal('redis');
                });
                expectAtLeastOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.server'),
                  span => expect(span.data.http.method).to.equal('POST')
                ]);
              });
            });
        });
      });

      describe('when ignore-endpoints is enabled via tracing configuration', async () => {
        globalAgent.setUpCleanUpHooks();
        const agentControls = globalAgent.instance;
        let controls;

        before(async () => {
          controls = new ProcessControls({
            useGlobalAgent: true,
            dirname: __dirname,
            env: {
              LIBRARY_LATEST: isLatest,
              LIBRARY_VERSION: version,
              LIBRARY_NAME: name,
              INSTANA_IGNORE_ENDPOINTS: 'redis:get'
            }
          });
          await controls.start();
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

        it('should ignore spans for ignored endpoint (get)', async function () {
          await controls
            .sendRequest({
              method: 'GET',
              path: '/values',
              qs: {
                key: 'discount',
                value: 50
              }
            })
            .then(async () => {
              return retry(async () => {
                const spans = await agentControls.getSpans();
                expect(spans.length).to.equal(1);
                spans.forEach(span => {
                  expect(span.n).not.to.equal('redis');
                });

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
              method: 'POST',
              path: '/values',
              qs: {
                key: 'discount',
                value: 50
              }
            })
            .then(async () => {
              return retry(async () => {
                const spans = await agentControls.getSpans();
                expect(spans.length).to.equal(2);

                const entrySpan = expectAtLeastOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.server'),
                  span => expect(span.data.http.method).to.equal('POST')
                ]);

                expectExactlyOneMatching(spans, [
                  span => expect(span.t).to.equal(entrySpan.t),
                  span => expect(span.p).to.equal(entrySpan.s),
                  span => expect(span.n).to.equal('redis'),
                  span => expect(span.data.redis.command).to.equal('set')
                ]);
              });
            });
        });
      });
    });
};
