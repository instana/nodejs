/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2017
 */

'use strict';

const expect = require('chai').expect;
const semver = require('semver');
const config = require('../../../core/test/config');
const { retry } = require('../../../core/test/test_util');
const globalAgent = require('../globalAgent');

describe('metrics/healthchecks', function() {
  // The npm package `admin` uses JavaScript language features which aren't available in all
  // Node.js versions
  if (!semver.satisfies(process.versions.node, '>=6.0.0')) {
    return;
  }

  const expressControls = require('../apps/expressControls');

  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  expressControls.registerTestHooks({
    useGlobalAgent: true,
    enableTracing: false
  });

  beforeEach(() => agentControls.waitUntilAppIsCompletelyInitialized(expressControls.getPid()));

  const start = new Date().getTime();

  it('must report health status', () => {
    let healthyTimestamp;
    return retry(() =>
      agentControls.getLastMetricValue(expressControls.getPid(), ['healthchecks']).then(healthchecks => {
        expect(healthchecks.configurable.healthy).to.equal(1);
        expect(healthchecks.configurable.since).to.be.gte(start);
        healthyTimestamp = healthchecks.configurable.since;
      })
    )
      .then(() => expressControls.setUnhealthy())
      .then(() =>
        retry(() =>
          agentControls.getLastMetricValue(expressControls.getPid(), ['healthchecks']).then(healthchecks => {
            expect(healthchecks.configurable.healthy).to.equal(0);
            expect(healthchecks.configurable.since).to.be.gt(healthyTimestamp);
          })
        )
      );
  });
});
