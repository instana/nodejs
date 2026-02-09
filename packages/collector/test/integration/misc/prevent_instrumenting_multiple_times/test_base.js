/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const expect = require('chai').expect;
const path = require('path');

const config = require('@_local/core/test/config');
const { delay, retry } = require('@_local/core/test/test_util');
const globalAgent = require('@_local/collector/test/globalAgent');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');

module.exports = function (name, version) {
  const timeout = config.getTestTimeout() * 6;
  this.timeout(timeout);

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  const versionDir = path.basename(__dirname).startsWith('_v') ? __dirname : path.join(__dirname, `_v${version}`);
  const pathToSeparateInstanaCollector = path.join(versionDir, 'node_modules', '@instana', 'collector', 'src', 'immediate');
  let controls;

  before(async () => {
    controls = new ProcessControls({
      dirname: __dirname,
      appPath: require.resolve('@_local/collector/test/apps/express'),
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
