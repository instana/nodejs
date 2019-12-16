'use strict';

const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const utils = require('../../../../../core/test/utils');

describe('tracing/redis', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  const agentControls = require('../../../apps/agentStubControls');
  const RedisControls = require('./controls');

  this.timeout(config.getTestTimeout());

  agentControls.registerTestHooks();

  const redisControls = new RedisControls({
    agentControls
  });
  redisControls.registerTestHooks();

  it('must trace set/get calls', () =>
    redisControls
      .sendRequest({
        method: 'POST',
        path: '/values',
        qs: {
          key: 'price',
          value: 42
        }
      })
      .then(() =>
        redisControls.sendRequest({
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
              expect(span.f.e).to.equal(String(redisControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
              expect(span.data.redis.connection).to.equal(process.env.REDIS);
              expect(span.data.redis.command).to.equal('set');
            });

            const readEntrySpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('GET');
              expect(span.f.e).to.equal(String(redisControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
            });

            utils.expectOneMatching(spans, span => {
              expect(span.t).to.equal(readEntrySpan.t);
              expect(span.p).to.equal(readEntrySpan.s);
              expect(span.n).to.equal('redis');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.f.e).to.equal(String(redisControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
              expect(span.data.redis.connection).to.equal(process.env.REDIS);
              expect(span.data.redis.command).to.equal('get');
            });
          })
        );
      }));

  it('must trace failed redis calls', () =>
    redisControls
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
              expect(span.f.e).to.equal(String(redisControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(true);
              expect(span.ec).to.equal(1);
              expect(span.data.redis.connection).to.equal(process.env.REDIS);
              expect(span.data.redis.command).to.equal('get');
              expect(span.data.redis.error).to.be.a('string');
            });
          })
        )
      ));

  it('must trace multi calls', () =>
    redisControls
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
              expect(span.f.e).to.equal(String(redisControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
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
    redisControls
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
              expect(span.f.e).to.equal(String(redisControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(true);
              expect(span.ec).to.equal(2);
              expect(span.b.s).to.equal(2);
              expect(span.b.u).to.not.exist;
              expect(span.data.redis.connection).to.equal(process.env.REDIS);
              expect(span.data.redis.command).to.equal('multi');
              expect(span.data.redis.subCommands).to.deep.equal(['hset', 'hget']);
            });
          })
        )
      ));

  it('must trace failed batch calls', () =>
    redisControls
      .sendRequest({
        method: 'GET',
        path: '/batchFailure'
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
              expect(span.f.e).to.equal(String(redisControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(true);
              expect(span.ec).to.equal(1);
              expect(span.b.s).to.equal(2);
              expect(span.b.u).to.not.exist;
              expect(span.data.redis.connection).to.equal(process.env.REDIS);
              expect(span.data.redis.command).to.equal('pipeline');
              expect(span.data.redis.subCommands).to.deep.equal(['hset', 'hget']);
            });
          })
        )
      ));

  it('must trace call sequences', () =>
    redisControls
      .sendRequest({
        method: 'GET',
        path: '/callSequence'
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
              expect(span.data.redis.command).to.equal('set');
              expect(span.f.e).to.equal(String(redisControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
            });

            utils.expectOneMatching(spans, span => {
              expect(span.t).to.equal(writeEntrySpan.t);
              expect(span.p).to.equal(writeEntrySpan.s);
              expect(span.n).to.equal('redis');
              expect(span.data.redis.command).to.equal('get');
              expect(span.f.e).to.equal(String(redisControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
            });
          })
        )
      ));
});
