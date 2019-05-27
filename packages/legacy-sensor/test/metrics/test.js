'use strict';

const expect = require('chai').expect;
const _ = require('lodash');

const config = require('../../../collector/test/config');
const utils = require('../../../collector/test/utils');

describe('legacy sensor/metrics', function() {
  this.timeout(config.getTestTimeout());

  const agentControls = require('../../../collector/test/apps/agentStubControls');
  const AppControls = require('./controls');
  const appControls = new AppControls({
    agentControls
  });

  agentControls.registerTestHooks();
  appControls.registerTestHooks();

  beforeEach(() => agentControls.waitUntilAppIsCompletelyInitialized(appControls.getPid()));

  it('must report metrics', () =>
    utils.retry(() =>
      agentControls.getAllMetrics(appControls.getPid()).then(allMetrics => {
        expect(findMetric(allMetrics, ['activeHandles'])).to.exist;
        expect(findMetric(allMetrics, ['gc', 'minorGcs'])).to.exist;
        expect(findMetric(allMetrics, ['gc', 'majorGcs'])).to.exist;
        expect(findMetric(allMetrics, ['healthchecks'])).to.exist;
        expect(findMetric(allMetrics, ['healthchecks'])).to.exist;
        expect(findMetric(allMetrics, ['versions'])).to.exist;
        expect(`v${findMetric(allMetrics, ['versions', 'node'])}`).to.equal(process.version);
      })
    ));
});

function findMetric(allMetrics, _path) {
  for (let i = allMetrics.length - 1; i >= 0; i--) {
    const value = _.get(allMetrics[i], ['data'].concat(_path));
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}
