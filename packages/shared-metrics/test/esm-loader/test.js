/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const path = require('path');
const _ = require('lodash');
const semver = require('semver');
const expect = require('chai').expect;
const { supportedVersion } = require('@instana/core').tracing;
const testUtils = require('@instana/core/test/test_util');
const config = require('@instana/core/test/config');

const ProcessControls = require('../../../collector/test/test_util/ProcessControls');

// NOTE: ESM loader & Node v20 do not work together. https://github.com/nodejs/help/issues/4190
const mochaSuiteFn =
  supportedVersion(process.versions.node) && semver.lt(process.versions.node, '20.0.0') ? describe : describe.skip;

mochaSuiteFn('ESM loader', function () {
  describe('case 1', function () {
    this.timeout(config.getTestTimeout());

    const controls = new ProcessControls({
      useGlobalAgent: true,
      cwd: path.join(__dirname, 'module'),
      appPath: path.join(__dirname, 'module', 'src', 'app'),
      execArgv: ['--experimental-loader=../../../../collector/esm-loader.mjs']
    });

    ProcessControls.setUpHooks(controls);

    it('should be able to find package.json', async () => {
      await testUtils.retry(() =>
        controls.agentControls.getAllMetrics(controls.getPid()).then(metrics => {
          const name = findMetric(metrics, ['name']);
          expect(name).to.equal('esm-loader');
        })
      );
    });
  });

  describe('case 2', function () {
    this.timeout(config.getTestTimeout());

    const controls = new ProcessControls({
      useGlobalAgent: true,
      cwd: path.join(__dirname, 'module'),
      appPath: path.join(__dirname, 'module-2', 'src', 'app.mjs'),
      execArgv: ['--experimental-loader', './../../../../collector/esm-loader.mjs']
    });

    ProcessControls.setUpHooks(controls);

    it('should be able to find package.json', async () => {
      await testUtils.retry(() =>
        controls.agentControls.getAllMetrics(controls.getPid()).then(metrics => {
          const name = findMetric(metrics, ['name']);
          expect(name).to.equal('esm-loader-2');
        })
      );
    });
  });

  describe('case 3', function () {
    this.timeout(config.getTestTimeout());

    const controls = new ProcessControls({
      useGlobalAgent: true,
      cwd: path.join(__dirname, 'module'),
      appPath: path.join(__dirname, 'module-3', 'node_modules', 'my-app', 'server.mjs'),
      execArgv: ['--experimental-loader', './../../../../collector/esm-loader.mjs']
    });

    ProcessControls.setUpHooks(controls);

    it('should be able to find package.json', async () => {
      await testUtils.retry(() =>
        controls.agentControls.getAllMetrics(controls.getPid()).then(metrics => {
          const name = findMetric(metrics, ['name']);
          expect(name).to.equal('my-app');
        })
      );
    });
  });

  describe('case 4 (NODE_OPTIONS)', function () {
    this.timeout(config.getTestTimeout());

    const controls = new ProcessControls({
      env: {
        NODE_OPTIONS: '--experimental-loader=../../../../collector/esm-loader.mjs'
      },
      useGlobalAgent: true,
      cwd: path.join(__dirname, 'module'),
      appPath: path.join(__dirname, 'module-3', 'node_modules', 'my-app', 'server.mjs')
    });

    ProcessControls.setUpHooks(controls);

    it('should be able to find package.json', async () => {
      await testUtils.retry(() =>
        controls.agentControls.getAllMetrics(controls.getPid()).then(metrics => {
          const name = findMetric(metrics, ['name']);
          expect(name).to.equal('my-app');
        })
      );
    });
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
