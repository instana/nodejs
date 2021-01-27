/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const expect = require('chai').expect;
const _ = require('lodash');

const config = require('../../../core/test/config');
const testUtils = require('../../../core/test/test_util');
const ProcessControls = require('../../../collector/test/test_util/ProcessControls');

describe('legacy sensor/metrics', function() {
  this.timeout(config.getTestTimeout());

  const agentControls = require('../../../collector/test/apps/agentStubControls');
  agentControls.registerTestHooks();

  const controls = new ProcessControls({
    dirname: __dirname,
    agentControls
  }).registerTestHooks();

  beforeEach(() => agentControls.waitUntilAppIsCompletelyInitialized(controls.getPid()));

  it('must report metrics', () =>
    testUtils.retry(() =>
      agentControls.getAllMetrics(controls.getPid()).then(allMetrics => {
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
