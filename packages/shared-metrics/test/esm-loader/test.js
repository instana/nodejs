/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const path = require('path');
const _ = require('lodash');
const expect = require('chai').expect;
const { supportedVersion } = require('@instana/core').tracing;
const testUtils = require('@instana/core/test/test_util');
const config = require('@instana/core/test/config');

const ProcessControls = require('../../../collector/test/test_util/ProcessControls');
const loaderPath = ['--import', '../../../../collector/esm-register.mjs'];

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('ESM loader', function () {
  describe('case 1', function () {
    this.timeout(config.getTestTimeout());

    let controls;
    before(async () => {
      controls = new ProcessControls({
        useGlobalAgent: true,
        cwd: path.join(__dirname, 'module'),
        appPath: path.join(__dirname, 'module', 'src', 'app'),
        execArgv: loaderPath
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
      await testUtils.retry(() => {
        return controls.agentControls.getAllMetrics(controls.getPid()).then(metrics => {
          const name = findMetric(metrics, ['name']);
          expect(name).to.equal('esm-loader');
        });
      });
    });
  });

  describe('case 2', function () {
    this.timeout(config.getTestTimeout());
    let controls;

    before(async () => {
      controls = new ProcessControls({
        useGlobalAgent: true,
        cwd: path.join(__dirname, 'module'),
        appPath: path.join(__dirname, 'module-2', 'src', 'app.mjs'),
        execArgv: loaderPath
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
      await testUtils.retry(() => {
        return controls.agentControls.getAllMetrics(controls.getPid()).then(metrics => {
          const name = findMetric(metrics, ['name']);
          expect(name).to.equal('esm-loader-2');
        });
      });
    });
  });

  describe('case 3', function () {
    this.timeout(config.getTestTimeout());
    let controls;

    before(async () => {
      controls = new ProcessControls({
        useGlobalAgent: true,
        cwd: path.join(__dirname, 'module'),
        appPath: path.join(__dirname, 'module-3', 'node_modules', 'my-app', 'server.mjs'),
        execArgv: loaderPath
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
      await testUtils.retry(() => {
        return controls.agentControls.getAllMetrics(controls.getPid()).then(metrics => {
          const name = findMetric(metrics, ['name']);
          expect(name).to.equal('my-app');
        });
      });
    });
  });

  describe('case 4 (NODE_OPTIONS)', function () {
    this.timeout(config.getTestTimeout());
    let controls;
    const nodeOption = '--import ../../../../collector/esm-register.mjs';

    before(async () => {
      controls = new ProcessControls({
        env: {
          NODE_OPTIONS: nodeOption
        },
        useGlobalAgent: true,
        cwd: path.join(__dirname, 'module'),
        appPath: path.join(__dirname, 'module-3', 'node_modules', 'my-app', 'server.mjs')
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
      await testUtils.retry(() => {
        return controls.agentControls.getAllMetrics(controls.getPid()).then(metrics => {
          const name = findMetric(metrics, ['name']);
          expect(name).to.equal('my-app');
        });
      });
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
