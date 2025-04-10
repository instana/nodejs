/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const expect = require('chai').expect;
const path = require('path');
const { execSync } = require('child_process');
const config = require('../../../../../../core/test/config');
const testUtils = require('../../../../../../core/test/test_util');
const isLatestEsmSupportedVersion = require('../../../../../../core').util.esm.isLatestEsmSupportedVersion;
const supportedVersion = require('../../../../../../core').tracing.supportedVersion;
const ProcessControls = require('../../../../test_util/ProcessControls');
const globalAgent = require('../../../../globalAgent');

const semver = require('semver');

const mochaSuiteFn =
  supportedVersion(process.versions.node) && semver.lt(semver.coerce(process.versions.node), '24.0.0')
    ? describe
    : describe.skip;

const loaderPath = isLatestEsmSupportedVersion(process.versions.node)
  ? ['--import', path.join(__dirname, 'node_modules', '@instana', 'collector', 'esm-register.mjs')]
  : ['--experimental-loader', path.join(__dirname, 'node_modules', '@instana', 'collector', 'esm-loader.mjs')];

mochaSuiteFn('Typescript TS->ESM', function () {
  this.timeout(config.getTestTimeout() * 5);

  describe('[CASE 1]', () => {
    globalAgent.setUpCleanUpHooks();
    const agentControls = globalAgent.instance;

    let controls;

    beforeEach(async () => {
      await agentControls.clearReceivedTraceData();
    });

    before(async () => {
      execSync('rm -rf ./dist', { cwd: __dirname, stdio: 'inherit' });
      execSync('rm -rf ./node_modules', { cwd: __dirname, stdio: 'inherit' });
      execSync('npm install --verbose', { cwd: __dirname, stdio: 'inherit' });
      execSync('npm run build', { cwd: __dirname, stdio: 'inherit' });
      execSync('cp ./package.json.tmp ./dist/package.json', { cwd: __dirname, stdio: 'inherit' });

      controls = new ProcessControls({
        appPath: path.join(__dirname, 'dist', 'app_1.js'),
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
      execSync('rm -rf ./dist', { cwd: __dirname, stdio: 'inherit' });
      execSync('rm -rf ./node_modules', { cwd: __dirname, stdio: 'inherit' });
      execSync('npm install --verbose', { cwd: __dirname, stdio: 'inherit' });
      execSync('npm run build', { cwd: __dirname, stdio: 'inherit' });
      execSync('cp ./package.json.tmp ./dist/package.json', { cwd: __dirname, stdio: 'inherit' });

      controls = new ProcessControls({
        appPath: path.join(__dirname, 'dist', 'app_2.js'),
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
