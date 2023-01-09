/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const path = require('path');
const _ = require('lodash');
const semver = require('semver');
const expect = require('chai').expect;

const testUtils = require('@instana/core/test/test_util');
const config = require('@instana/core/test/config');

const ProcessControls = require('../../../collector/test/test_util/ProcessControls');

// NOTE: Node 10 needs to use .mjs file ending & --experimental-modules flag
const mochaSuiteFn = semver.gte(process.versions.node, '12.0.0') ? describe : describe.skip;

mochaSuiteFn('ejs require collector in preload', function () {
  this.timeout(config.getTestTimeout());

  const controls = new ProcessControls({
    useGlobalAgent: true,
    cwd: path.join(__dirname, 'module'),
    appPath: path.join(__dirname, 'module', 'src', 'app'),
    env: {
      NODE_OPTIONS: '--require ./load-instana.cjs'
    }
  });

  ProcessControls.setUpHooks(controls);

  it('should be able to find package.json', async () => {
    await testUtils.retry(() =>
      controls.agentControls.getAllMetrics(controls.getPid()).then(metrics => {
        const name = findMetric(metrics, ['name']);
        expect(name).to.equal('@instana/shared-metrics');
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
