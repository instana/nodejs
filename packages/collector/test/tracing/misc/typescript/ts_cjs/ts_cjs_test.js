/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const expect = require('chai').expect;
const path = require('path');
const { execSync } = require('child_process');
const config = require('@instana/core/test/config');
const ProcessControls = require('../../../../test_util/ProcessControls');
const globalAgent = require('../../../../globalAgent');
const testUtils = require('@instana/core/test/test_util');
const supportedVersion = require('@instana/core').tracing.supportedVersion;

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe.only : describe.skip;

mochaSuiteFn('Typescript TS->JS', function () {
  this.timeout(config.getTestTimeout() * 5);

  mochaSuiteFn('[CASE 1]', () => {
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

      controls = new ProcessControls({
        appPath: path.join(__dirname, 'dist', 'app_1.js'),
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

  mochaSuiteFn('[CASE 2]', () => {
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

      controls = new ProcessControls({
        appPath: path.join(__dirname, 'dist', 'app_2.js'),
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
