/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const expect = require('chai').expect;
const path = require('path');
const os = require('os');
const { mkdtempSync } = require('fs');
const rimraf = require('rimraf');

const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('@instana/core/test/config');
const testUtils = require('@instana/core/test/test_util');
const ProcessControls = require('../../../../test_util/ProcessControls');
const globalAgent = require('../../../../globalAgent');
const isLatestEsmSupportedVersion = require('@instana/core').util.esm.isLatestEsmSupportedVersion;
const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('[ESM] tracing/sdk/multiple_installations', function () {
  this.timeout(Math.max(config.getTestTimeout() * 3, 30000));

  const pwdCollectorPkg = path.join(__dirname, '..', '..', '..', '..', '..');
  const tmpDirPath = path.join(os.tmpdir(), '@instana-collector-test-prevent-multiple-installations');
  const tmpDir = mkdtempSync(tmpDirPath);
  const pathToSeparateInstanaCollector = path.join(tmpDir, 'node_modules', '@instana', 'collector', 'src', 'index.js');

  before(() => {
    testUtils.runCommandSync(`npm install --production --no-optional --no-audit ${pwdCollectorPkg}`, tmpDir);
  });

  after(done => {
    rimraf(tmpDir, done);
  });

  const agentControls = globalAgent.instance;
  globalAgent.setUpCleanUpHooks();

  let controls;

  before(async () => {
    const nodeOptions = isLatestEsmSupportedVersion(process.versions.node)
      ? '--import ./load-instana.mjs'
      : '--experimental-loader ./load-instana.mjs';
    controls = new ProcessControls({
      useGlobalAgent: true,
      cwd: path.join(__dirname, 'src'),
      appPath: path.join(__dirname, 'src', 'app.mjs'),
      env: {
        NODE_OPTIONS: nodeOptions,
        INSTANA_COLLECTOR_PATH: pathToSeparateInstanaCollector
      }
    });

    await controls.startAndWaitForAgentConnection();
  });

  beforeEach(async () => {
    await agentControls.clearReceivedTraceData();
  });

  after(async () => {
    await controls.stop();
  });

  afterEach(async () => {
    await controls.clearIpcMessages();
  });

  it('should trace http & sdk spans', async () => {
    await controls.sendRequest({ method: 'GET', path: '/trace' });

    await testUtils.retry(
      async () => {
        const spans = await agentControls.getSpans();

        // 2x SDK, 1x HTTP ENTRY
        expect(spans.length).to.eql(3);
      },
      500,
      Date.now() + 10 * 1000
    );
  });
});
