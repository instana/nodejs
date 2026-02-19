/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const expect = require('chai').expect;
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const config = require('@_local/core/test/config');
const testUtils = require('@_local/core/test/test_util');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const globalAgent = require('@_local/collector/test/globalAgent');

const loaderPath = ['--import', path.join(__dirname, 'node_modules', '@instana', 'collector', 'esm-register.mjs')];

module.exports = function () {
  describe('Typescript TS->ESM', function () {
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
        fs.writeFileSync(path.join(__dirname, 'dist', 'package.json'), '{"type":"module"}\n');

        controls = new ProcessControls({
          dirname: __dirname,
          appName: 'dist/app_1',
          useGlobalAgent: true,
          execArgv: loaderPath
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
        execSync('rm -rf ./node_modules', { cwd: __dirname, stdio: 'inherit' });
        execSync('npm install --verbose', { cwd: __dirname, stdio: 'inherit' });
        execSync('npm run build', { cwd: __dirname, stdio: 'inherit' });
        fs.writeFileSync(path.join(__dirname, 'dist', 'package.json'), '{"type":"module"}\n');

        controls = new ProcessControls({
          dirname: __dirname,
          appName: 'dist/app_2',
          useGlobalAgent: true,
          execArgv: loaderPath
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
