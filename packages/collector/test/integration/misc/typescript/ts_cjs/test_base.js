/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const expect = require('chai').expect;
const path = require('path');
const { execSync } = require('child_process');
const config = require('@_local/core/test/config');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const globalAgent = require('@_local/collector/test/globalAgent');
const testUtils = require('@_local/core/test/test_util');

module.exports = function () {
  describe('Typescript TS->JS', function () {
    this.timeout(config.getTestTimeout() * 5);

    describe('[CASE 1]', () => {
      globalAgent.setUpCleanUpHooks();
      const agentControls = globalAgent.instance;

      let controls;

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });

      before(async () => {
        execSync('npm run build', { cwd: __dirname, stdio: 'inherit' });

        controls = new ProcessControls({
          dirname: __dirname,
          appName: 'dist/app_1',
          useGlobalAgent: true,
          execArgv: ['--require', path.join(__dirname, 'node_modules', '@instana', 'collector', 'src', 'immediate.js')]
        });

        await controls.startAndWaitForAgentConnection();
      });

      after(async () => {
        await controls.stop();
      });

      it('[app_1] should be able to load Instana SDK', async () => {
        await controls.sendRequest({
          method: 'GET',
          path: '/request'
        });

        await testUtils.retry(async () => {
          const spans = await controls.agentControls.getSpans();
          expect(spans.length).to.equal(2);
        });
      });
    });

    describe('[CASE 2]', () => {
      globalAgent.setUpCleanUpHooks();
      const agentControls = globalAgent.instance;

      let controls;

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });

      before(async () => {
        execSync('npm run build', { cwd: __dirname, stdio: 'inherit' });

        controls = new ProcessControls({
          dirname: __dirname,
          appName: 'dist/app_2',
          useGlobalAgent: true,
          execArgv: ['--require', path.join(__dirname, 'node_modules', '@instana', 'collector', 'src', 'immediate.js')]
        });

        await controls.startAndWaitForAgentConnection();
      });

      after(async () => {
        await controls.stop();
      });

      it('[app_2] should be able to load Instana SDK', async () => {
        await controls.sendRequest({
          method: 'GET',
          path: '/request'
        });

        await testUtils.retry(async () => {
          const spans = await controls.agentControls.getSpans();
          expect(spans.length).to.equal(2);
        });
      });
    });
  });
};
