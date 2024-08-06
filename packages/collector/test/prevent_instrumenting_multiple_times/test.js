/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const expect = require('chai').expect;
const { mkdtempSync } = require('fs');
const os = require('os');
const path = require('path');
const rimraf = require('rimraf');

const config = require('@instana/core/test/config');
const { delay, retry, runCommandSync } = require('@instana/core/test/test_util');
const globalAgent = require('../globalAgent');
const ProcessControls = require('../test_util/ProcessControls');

describe('prevent initializing @instana/collector multiple times', function () {
  const timeout = config.getTestTimeout() * 6;
  this.timeout(timeout);

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  const tmpDir = mkdtempSync(path.join(os.tmpdir(), '@instana-collector-test-prevent-multiple-init'));
  const pathToSeparateInstanaCollector = path.join(tmpDir, 'node_modules', '@instana', 'collector', 'src', 'immediate');
  let controls;

  before(async () => {
    runCommandSync('pnpm install --prod --no-optional --no-lockfile --ignore-workspace @instana/collector', tmpDir);

    controls = new ProcessControls({
      appPath: path.join(__dirname, '..', 'apps', 'express'),
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
    await delay(100); // give potential multiple announce attempts time to be triggered
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
    expect(response.t).to.be.a('string');
    expect(response.t).to.have.lengthOf.at.least(16);
    expect(response.s).to.be.a('string');
    expect(response.s).to.have.lengthOf(16);
  });
});
