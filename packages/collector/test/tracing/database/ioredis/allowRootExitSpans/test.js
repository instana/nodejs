/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const expect = require('chai').expect;
const semver = require('semver');
const path = require('path');

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../../core/test/config');
const { expectAtLeastOneMatching, retry } = require('../../../../../../core/test/test_util');
const ProcessControls = require('../../../../test_util/ProcessControls');
const globalAgent = require('../../../../globalAgent');

const mochaSuiteFn =
  semver.gte(process.versions.node, '14.0.0') && supportedVersion(process.versions.node)
    ? describe.only
    : describe.skip;

function checkConnection(span, setupType) {
  if (setupType === 'cluster') {
    // NOTE: we currently extract the client ip address of the cluster
    // TODO: https://jsw.ibm.com/browse/INSTA-14540
    expect(span.data.redis.connection).to.exist;
  } else {
    expect(span.data.redis.connection).to.equal(process.env.REDIS);
  }
}

// describe('ioredis/allowRootExitSpans');
mochaSuiteFn('default: When allowRootExitSpan: true is set', function () {
  this.timeout(config.getTestTimeout() * 4);

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;
  let controls;

  before(async () => {
    controls = new ProcessControls({
      useGlobalAgent: true,
      appPath: path.join(__dirname, 'app_default'),
      env: {
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
      // 1 x quit command
      spans.forEach(sp => {
        console.log(sp.k, sp.n, sp.data);
      });
      expect(spans.length).to.be.eql(5);

      expectAtLeastOneMatching(spans, [
        span => expect(span.n).to.equal('redis'),
        span => expect(span.k).to.equal(2),
        span => expect(span.p).to.not.exist
      ]);

      expectAtLeastOneMatching(spans, [
        span => expect(span.n).to.equal('redis'),
        span => expect(span.k).to.equal(constants.EXIT),
        span => expect(span.f.e).to.equal(String(controls.getPid())),
        span => expect(span.f.h).to.equal('agent-stub-uuid'),
        span => expect(span.async).to.not.exist,
        span => expect(span.error).to.not.exist,
        span => expect(span.ec).to.equal(0),
        span => checkConnection(span, 'default')
        // span => expect(span.data.redis.command).to.equal('set')
      ]);
    });
  });
});

mochaSuiteFn('cluster: When allowRootExitSpan: true is set', function () {
  this.timeout(config.getTestTimeout() * 4);

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;
  let controls;

  before(async () => {
    controls = new ProcessControls({
      useGlobalAgent: true,
      appPath: path.join(__dirname, 'app_with_cluster'),
      env: {
        REDIS_CLUSTER: true
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
      // 2 x 1 x multi containing the sub commands
      // 2 x 1 x exec span
      // 2 x 2 x sub commands

      spans.forEach(sp => {
        console.log(sp.k, sp.n, sp.data);
      });
      expect(spans.length).to.be.eql(9);

      expectAtLeastOneMatching(spans, [
        span => expect(span.n).to.equal('redis'),
        span => expect(span.k).to.equal(constants.EXIT),
        span => expect(span.p).to.not.exist
      ]);

      expectAtLeastOneMatching(spans, [
        span => expect(span.n).to.equal('redis'),
        span => expect(span.k).to.equal(constants.EXIT),
        span => expect(span.f.e).to.equal(String(controls.getPid())),
        span => expect(span.f.h).to.equal('agent-stub-uuid'),
        span => expect(span.async).to.not.exist,
        span => expect(span.error).to.not.exist,
        span => expect(span.ec).to.equal(0),
        span => checkConnection(span, 'cluster')
        // span => expect(span.data.redis.command).to.equal('set')
      ]);
    });
  });
});
