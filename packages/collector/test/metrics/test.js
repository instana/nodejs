'use strict';

var expect = require('chai').expect;
var _ = require('lodash');

var config = require('../config');
var utils = require('../utils');

describe('metrics', function() {
  this.timeout(config.getTestTimeout());

  var agentControls = require('../apps/agentStubControls');
  var expressControls = require('../apps/expressControls');

  agentControls.registerTestHooks();
  expressControls.registerTestHooks({
    enableTracing: false
  });

  beforeEach(function() {
    return agentControls.waitUntilAppIsCompletelyInitialized(expressControls.getPid());
  });

  it('must report metrics', function() {
    return utils.retry(function() {
      return agentControls.getAllMetrics(expressControls.getPid()).then(function(allMetrics) {
        expect(findMetric(allMetrics, ['activeHandles'])).to.exist;
        expect(findMetric(allMetrics, ['gc', 'minorGcs'])).to.exist;
        expect(findMetric(allMetrics, ['gc', 'majorGcs'])).to.exist;
        expect(findMetric(allMetrics, ['healthchecks'])).to.exist;
        expect(findMetric(allMetrics, ['healthchecks'])).to.exist;
        expect(findMetric(allMetrics, ['versions'])).to.exist;
        expect('v' + findMetric(allMetrics, ['versions', 'node'])).to.equal(process.version);
      });
    });
  });
});

function findMetric(allMetrics, _path) {
  for (var i = allMetrics.length - 1; i >= 0; i--) {
    var value = _.get(allMetrics[i], ['data'].concat(_path));
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}
