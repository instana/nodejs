'use strict';

var expect = require('chai').expect;
var semver = require('semver');
var config = require('../config');
var utils = require('../utils');

describe('metrics/healthchecks', function() {
  // admin uses JavaScript language features which aren't available in all
  // Node.js versions
  if (!semver.satisfies(process.versions.node, '>=6.0.0')) {
    return;
  }

  // require controls at this place, because the modules themselves aren't compatible with Node.js 0.12
  var agentStubControls = require('../apps/agentStubControls');
  var expressControls = require('../apps/expressControls');

  this.timeout(config.getTestTimeout());

  var start = new Date().getTime();

  agentStubControls.registerTestHooks();
  expressControls.registerTestHooks({
    enableTracing: false
  });

  beforeEach(function() {
    return agentStubControls.waitUntilAppIsCompletelyInitialized(expressControls.getPid());
  });

  it('must report health status', function() {
    var healthyTimestamp;
    return utils
      .retry(function() {
        return agentStubControls
          .getLastMetricValue(expressControls.getPid(), ['healthchecks'])
          .then(function(healthchecks) {
            expect(healthchecks.configurable.healthy).to.equal(1);
            expect(healthchecks.configurable.since).to.be.gte(start);
            healthyTimestamp = healthchecks.configurable.since;
          });
      })
      .then(function() {
        return expressControls.setUnhealthy();
      })
      .then(function() {
        return utils.retry(function() {
          return agentStubControls
            .getLastMetricValue(expressControls.getPid(), ['healthchecks'])
            .then(function(healthchecks) {
              expect(healthchecks.configurable.healthy).to.equal(0);
              expect(healthchecks.configurable.since).to.be.gt(healthyTimestamp);
            });
        });
      });
  });
});
