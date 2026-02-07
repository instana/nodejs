/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const expect = require('chai').expect;
const { mkdtempSync } = require('fs');
const os = require('os');
const path = require('path');
const rimraf = require('rimraf');

const config = require('@_local/core/test/config');
const { delay, retry, runCommandSync } = require('@_local/core/test/test_util');
const globalAgent = require('@_local/collector/test/globalAgent');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');

module.exports = function () {
  const timeout = config.getTestTimeout() * 6;
  this.timeout(timeout);

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  const tmpDir = mkdtempSync(path.join(os.tmpdir(), '@instana-collector-test-prevent-multiple-init'));
  const pathToSeparateInstanaCollector = path.join(tmpDir, 'node_modules', '@instana', 'collector', 'src', 'immediate');
  let controls;

  before(async () => {
    const copath = path.join(__dirname, '..', '..', '..', '..', '..', 'collector');
    runCommandSync('npm pack', copath);

    const coversion = require(`${copath}/package.json`).version;
    runCommandSync(
      `npm install --production --no-optional --no-audit ${copath}/instana-collector-${coversion}.tgz`,
      tmpDir
    );

    const corepath = path.join(__dirname, '..', '..', '..', '..', '..', 'core');
    runCommandSync('npm pack', corepath);

    const coreversion = require(`${copath}/package.json`).version;
    runCommandSync(
      `npm install --production --no-optional --no-audit ${corepath}/instana-core-${coreversion}.tgz`,
      tmpDir
    );

    const sharedMetrics = path.join(__dirname, '..', '..', '..', '..', '..', 'shared-metrics');
    runCommandSync('npm pack', sharedMetrics);

    const sharedMetricsVersion = require(`${copath}/package.json`).version;
    runCommandSync(
      // eslint-disable-next-line max-len
      `npm install --production --no-optional --no-audit ${sharedMetrics}/instana-shared-metrics-${sharedMetricsVersion}.tgz`,
      tmpDir
    );

    controls = new ProcessControls({
      appPath: path.join(__dirname, '..', '..', '..', '..', 'apps', 'express'),
      execArgv: ['--require', pathToSeparateInstanaCollector],
      useGlobalAgent: true,
      env: {
        INSTANA_COPY_PRECOMPILED_NATIVE_ADDONS: 'false',
        INSTANA_LOG_LEVEL: 'error'
      }
    });

    await controls.startAndWaitForAgentConnection(1000, Date.now() + timeout);
  });

  beforeEach(async () => {
    await agentControls.clearReceivedTraceData();
  });

  after(done => {
    rimraf(tmpDir, done);
  });

  after(async () => {
    await controls.stop();
  });

  afterEach(async () => {
    await controls.clearIpcMessages();
  });

  it('must only announce to agent once', async () => {
    await delay(100);
    await retry(() =>
      agentControls.getDiscoveries().then(discoveries => {
        const announceAttemptsForPid = discoveries[String(controls.getPid())];
        expect(
          announceAttemptsForPid,
          `Expected only one announce attempt, but two have been recorded: ${JSON.stringify(
            announceAttemptsForPid,
            null,
            2
          )}`
        ).to.have.lengthOf(1);
      })
    );
  });

  it('must still export the active Instana handle', async () => {
    const response = await controls.sendRequest({
      path: '/trace-id-and-span-id'
    });

    return retry(async () => {
      expect(response.t).to.be.a('string');
      expect(response.t).to.have.lengthOf.at.least(16);
      expect(response.s).to.be.a('string');
      expect(response.s).to.have.lengthOf(16);
    });
  });
};
