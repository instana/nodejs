'use strict';

const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const utils = require('../../../../../core/test/utils');

describe('tracing/ioredis', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  const agentControls = require('../../../apps/agentStubControls');
  const IoRedisControls = require('./controls');

  this.timeout(config.getTestTimeout());

  agentControls.registerTestHooks();

  const ioRedisControls = new IoRedisControls({
    agentControls
  });
  ioRedisControls.registerTestHooks();

  it('must trace set/get calls', () =>
    ioRedisControls
      .sendRequest({
        method: 'POST',
        path: '/values',
        qs: {
          key: 'price',
          value: 42
        }
      })
      .then(() =>
        ioRedisControls.sendRequest({
          method: 'GET',
          path: '/values',
          qs: {
            key: 'price'
          }
        })
      )
      .then(response => {
        expect(String(response)).to.equal('42');

        return utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const writeEntrySpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('POST');
            });

            utils.expectOneMatching(spans, span => {
              expect(span.t).to.equal(writeEntrySpan.t);
              expect(span.p).to.equal(writeEntrySpan.s);
              expect(span.n).to.equal('redis');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.f.e).to.equal(String(ioRedisControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
              expect(span.data.redis.connection).to.equal(process.env.REDIS);
              expect(span.data.redis.command).to.equal('set');
            });

            const readEntrySpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('GET');
            });

            utils.expectOneMatching(spans, span => {
              expect(span.t).to.equal(readEntrySpan.t);
              expect(span.p).to.equal(readEntrySpan.s);
              expect(span.n).to.equal('redis');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.f.e).to.equal(String(ioRedisControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
              expect(span.data.redis.connection).to.equal(process.env.REDIS);
              expect(span.data.redis.command).to.equal('get');
            });
          })
        );
      }));

  it('must keep the tracing context', () =>
    ioRedisControls
      .sendRequest({
        method: 'POST',
        path: '/values',
        qs: {
          key: 'keepTracing',
          value: 13
        }
      })
      .then(() =>
        ioRedisControls.sendRequest({
          method: 'GET',
          path: '/keepTracing',
          qs: {
            key: 'keepTracing'
          }
        })
      )
      .then(response => {
        expect(String(response)).to.equal('OK;13');

        return utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const writeEntrySpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('POST');
            });

            utils.expectOneMatching(spans, span => {
              expect(span.t).to.equal(writeEntrySpan.t);
              expect(span.p).to.equal(writeEntrySpan.s);
              expect(span.n).to.equal('redis');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.f.e).to.equal(String(ioRedisControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
              expect(span.data.redis.connection).to.equal(process.env.REDIS);
              expect(span.data.redis.command).to.equal('set');
            });

            const readEntrySpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('GET');
            });

            utils.expectOneMatching(spans, span => {
              expect(span.t).to.equal(readEntrySpan.t);
              expect(span.p).to.equal(readEntrySpan.s);
              expect(span.n).to.equal('redis');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.f.e).to.equal(String(ioRedisControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
              expect(span.data.redis.connection).to.equal(process.env.REDIS);
              expect(span.data.redis.command).to.equal('get');
            });

            utils.expectOneMatching(spans, span => {
              expect(span.t).to.equal(readEntrySpan.t);
              expect(span.p).to.equal(readEntrySpan.s);
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.f.e).to.equal(String(ioRedisControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
              expect(span.data.http.method).to.equal('GET');
              expect(span.data.http.url).to.match(/http:\/\/127\.0\.0\.1:/);
              expect(span.data.http.status).to.equal(200);
            });
          })
        );
      }));

  it('must keep the tracing context with ioredis via callback', () =>
    ioRedisControls
      .sendRequest({
        method: 'POST',
        path: '/values',
        qs: {
          key: 'keepTracing',
          value: 13
        }
      })
      .then(() =>
        ioRedisControls.sendRequest({
          method: 'GET',
          path: '/keepTracingCallback',
          qs: {
            key: 'keepTracing'
          }
        })
      )
      .then(response => {
        expect(String(response)).to.equal('OK;13');

        return utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const writeEntrySpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('POST');
            });

            utils.expectOneMatching(spans, span => {
              expect(span.t).to.equal(writeEntrySpan.t);
              expect(span.p).to.equal(writeEntrySpan.s);
              expect(span.n).to.equal('redis');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.f.e).to.equal(String(ioRedisControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
              expect(span.data.redis.connection).to.equal(process.env.REDIS);
              expect(span.data.redis.command).to.equal('set');
            });

            const readEntrySpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('GET');
            });

            utils.expectOneMatching(spans, span => {
              expect(span.t).to.equal(readEntrySpan.t);
              expect(span.p).to.equal(readEntrySpan.s);
              expect(span.n).to.equal('redis');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.f.e).to.equal(String(ioRedisControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
              expect(span.data.redis.connection).to.equal(process.env.REDIS);
              expect(span.data.redis.command).to.equal('get');
            });

            utils.expectOneMatching(spans, span => {
              expect(span.t).to.equal(readEntrySpan.t);
              expect(span.p).to.equal(readEntrySpan.s);
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.f.e).to.equal(String(ioRedisControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
              expect(span.data.http.method).to.equal('GET');
              expect(span.data.http.url).to.match(/http:\/\/127\.0\.0\.1:/);
              expect(span.data.http.status).to.equal(200);
            });
          })
        );
      }));

  it('must trace failed redis calls', () =>
    ioRedisControls
      .sendRequest({
        method: 'GET',
        path: '/failure'
      })
      .catch(() => {
        // ignore errors
      })
      .then(() =>
        utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const writeEntrySpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('GET');
            });

            utils.expectOneMatching(spans, span => {
              expect(span.t).to.equal(writeEntrySpan.t);
              expect(span.p).to.equal(writeEntrySpan.s);
              expect(span.n).to.equal('redis');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.f.e).to.equal(String(ioRedisControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(1);
              expect(span.data.redis.connection).to.equal(process.env.REDIS);
              expect(span.data.redis.command).to.equal('get');
              expect(span.data.redis.error).to.be.a('string');
            });
          })
        )
      ));

  it('must trace multi calls', () =>
    ioRedisControls
      .sendRequest({
        method: 'GET',
        path: '/multi'
      })
      .then(() =>
        utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const writeEntrySpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('GET');
            });

            utils.expectOneMatching(spans, span => {
              expect(span.t).to.equal(writeEntrySpan.t);
              expect(span.p).to.equal(writeEntrySpan.s);
              expect(span.n).to.equal('redis');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.f.e).to.equal(String(ioRedisControls.getPid()));
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
          })
        )
      ));

  it('must trace failed multi calls', () =>
    ioRedisControls
      .sendRequest({
        method: 'GET',
        path: '/multiFailure'
      })
      .catch(() => {
        // ignore errors
      })
      .then(() =>
        utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const writeEntrySpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('GET');
            });

            utils.expectOneMatching(spans, span => {
              expect(span.t).to.equal(writeEntrySpan.t);
              expect(span.p).to.equal(writeEntrySpan.s);
              expect(span.n).to.equal('redis');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.f.e).to.equal(String(ioRedisControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(2);
              expect(span.b.s).to.equal(2);
              expect(span.b.u).to.not.exist;
              expect(span.data.redis.connection).to.equal(process.env.REDIS);
              expect(span.data.redis.command).to.equal('multi');
              expect(span.data.redis.subCommands).to.deep.equal(['hset', 'hget']);
              expect(span.data.redis.error).to.be.a('string');
            });
          })
        )
      ));

  it('must keep the tracing context after multi', () =>
    ioRedisControls
      .sendRequest({
        method: 'POST',
        path: '/multiKeepTracing'
      })
      .then(() =>
        utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const entrySpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('POST');
            });

            utils.expectOneMatching(spans, span => {
              expect(span.t).to.equal(entrySpan.t);
              expect(span.p).to.equal(entrySpan.s);
              expect(span.n).to.equal('redis');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.f.e).to.equal(String(ioRedisControls.getPid()));
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

            utils.expectOneMatching(spans, span => {
              expect(span.t).to.equal(entrySpan.t);
              expect(span.p).to.equal(entrySpan.s);
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.f.e).to.equal(String(ioRedisControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
              expect(span.data.http.method).to.equal('GET');
              expect(span.data.http.url).to.match(/http:\/\/127\.0\.0\.1:/);
              expect(span.data.http.status).to.equal(200);
            });
          })
        )
      ));

  it('must trace pipeline calls', () =>
    ioRedisControls
      .sendRequest({
        method: 'GET',
        path: '/pipeline'
      })
      .then(() =>
        utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const writeEntrySpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('GET');
            });

            utils.expectOneMatching(spans, span => {
              expect(span.t).to.equal(writeEntrySpan.t);
              expect(span.p).to.equal(writeEntrySpan.s);
              expect(span.n).to.equal('redis');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.f.e).to.equal(String(ioRedisControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
              expect(span.b.s).to.equal(3);
              expect(span.b.u).to.not.exist;
              expect(span.data.redis.connection).to.equal(process.env.REDIS);
              expect(span.data.redis.command).to.equal('pipeline');
              expect(span.data.redis.subCommands).to.deep.equal(['hset', 'hset', 'hget']);
            });
          })
        )
      ));

  it('must trace partially failed pipeline calls', () =>
    ioRedisControls
      .sendRequest({
        method: 'GET',
        path: '/pipelineFailure'
      })
      .then(() =>
        utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const writeEntrySpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('GET');
            });

            utils.expectOneMatching(spans, span => {
              expect(span.t).to.equal(writeEntrySpan.t);
              expect(span.p).to.equal(writeEntrySpan.s);
              expect(span.n).to.equal('redis');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.f.e).to.equal(String(ioRedisControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(1);
              expect(span.b.s).to.equal(3);
              expect(span.b.u).to.not.exist;
              expect(span.data.redis.connection).to.equal(process.env.REDIS);
              expect(span.data.redis.command).to.equal('pipeline');
              expect(span.data.redis.subCommands).to.deep.equal(['hset', 'hset', 'hget']);
              expect(span.data.redis.error).to.be.a('string');
            });
          })
        )
      ));

  it('must keep the tracing context after pipeline', () =>
    ioRedisControls
      .sendRequest({
        method: 'POST',
        path: '/pipelineKeepTracing'
      })
      .then(() =>
        utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const entrySpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('POST');
            });

            utils.expectOneMatching(spans, span => {
              expect(span.t).to.equal(entrySpan.t);
              expect(span.p).to.equal(entrySpan.s);
              expect(span.n).to.equal('redis');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.f.e).to.equal(String(ioRedisControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
              expect(span.b.s).to.equal(2);
              expect(span.b.u).to.not.exist;
              expect(span.data.redis.connection).to.equal(process.env.REDIS);
              expect(span.data.redis.command).to.equal('pipeline');
              expect(span.data.redis.subCommands).to.deep.equal(['hset', 'hget']);
            });

            utils.expectOneMatching(spans, span => {
              expect(span.t).to.equal(entrySpan.t);
              expect(span.p).to.equal(entrySpan.s);
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.f.e).to.equal(String(ioRedisControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
              expect(span.data.http.method).to.equal('GET');
              expect(span.data.http.url).to.match(/http:\/\/127\.0\.0\.1:/);
              expect(span.data.http.status).to.equal(200);
            });
          })
        )
      ));
});
