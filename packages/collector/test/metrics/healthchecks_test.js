'use strict';

const expect = require('chai').expect;
const semver = require('semver');
const config = require('../../../core/test/config');
const utils = require('../../../core/test/utils');

describe('metrics/healthchecks', function() {
  // admin uses JavaScript language features which aren't available in all
  // Node.js versions
  if (!semver.satisfies(process.versions.node, '>=6.0.0')) {
    return;
  }

  const agentStubControls = require('../apps/agentStubControls');
  const expressControls = require('../apps/expressControls');

  this.timeout(config.getTestTimeout());

  const start = new Date().getTime();

  agentStubControls.registerTestHooks();
  expressControls.registerTestHooks({
    enableTracing: false
  });

  beforeEach(() => agentStubControls.waitUntilAppIsCompletelyInitialized(expressControls.getPid()));

  it('must report health status', () => {
    let healthyTimestamp;
    return utils
      .retry(() =>
        agentStubControls.getLastMetricValue(expressControls.getPid(), ['healthchecks']).then(healthchecks => {
          expect(healthchecks.configurable.healthy).to.equal(1);
          expect(healthchecks.configurable.since).to.be.gte(start);
          healthyTimestamp = healthchecks.configurable.since;
        })
      )
      .then(() => expressControls.setUnhealthy())
      .then(() =>
        utils.retry(() =>
          agentStubControls.getLastMetricValue(expressControls.getPid(), ['healthchecks']).then(healthchecks => {
            expect(healthchecks.configurable.healthy).to.equal(0);
            expect(healthchecks.configurable.since).to.be.gt(healthyTimestamp);
          })
        )
      );
  });
});
