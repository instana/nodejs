/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const path = require('path');
const _ = require('lodash');
const expect = require('chai').expect;

const testUtils = require('@_local/core/test/test_util');
const config = require('@_local/core/test/config');

const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');

describe('cjs require collector in preload phase', function () {
  this.timeout(config.getTestTimeout());
  let controls;

  before(async () => {
    controls = new ProcessControls({
      dirname: __dirname,
      useGlobalAgent: true,
      cwd: path.join(__dirname, 'module'),
      appPath: path.join(__dirname, 'module', 'src', 'app'),
      env: {
        NODE_OPTIONS: '--require ./load-instana.js'
      }
    });

    await controls.startAndWaitForAgentConnection();
  });

  beforeEach(async () => {
    await controls.agentControls.clearReceivedTraceData();
  });

  after(async () => {
    await controls.stop();
  });

  it('should be able to find package.json', async () => {
    await testUtils.retry(() =>
      controls.agentControls.getAllMetrics(controls.getPid()).then(metrics => {
        const name = findMetric(metrics, ['name']);
        expect(name).to.equal('@_local/shared-metrics');
      })
    );
  });
});

/**
 * Find a particular metric in all collected metrics.
 *
 * @param {Object[]} allMetrics All collected metrics
 * @param {string[]} _path The path to the metric in question
 */
function findMetric(allMetrics, _path) {
  for (let i = allMetrics.length - 1; i >= 0; i--) {
    const value = _.get(allMetrics[i], ['data'].concat(_path));
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}
