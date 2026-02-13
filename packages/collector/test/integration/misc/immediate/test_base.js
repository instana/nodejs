/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const path = require('path');
const { expect } = require('chai');
const { spawn } = require('child_process');
const _ = require('lodash');
const portfinder = require('@_local/collector/test/test_util/portfinder');

const config = require('@_local/core/test/config');
const { delay, retry } = require('@_local/core/test/test_util');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const globalAgent = require('@_local/collector/test/globalAgent');

module.exports = function (name, version) {
  const inVersionDir = path.basename(__dirname).startsWith('_v')
    || path.basename(path.dirname(__dirname)).startsWith('_v');
  const versionDir = inVersionDir ? __dirname : path.join(__dirname, `_v${version}`);
  const agentControls = globalAgent.instance;
  let controls;

  globalAgent.setUpCleanUpHooks();

  this.timeout(config.getTestTimeout());

  describe('an application instrumented via NODE_OPTIONS', () => {
    before(async () => {
      controls = new ProcessControls({
        useGlobalAgent: true,
        dirname: __dirname,
        cwd: versionDir,
        env: {
          NODE_OPTIONS: '--require @instana/collector/src/immediate'
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

    it('should have connected to the agent', async () => {
      const pidsThatContactedTheAgent = await agentControls.getDiscoveries();
      expect(pidsThatContactedTheAgent[controls.getPid()]).to.exist;
    });
  });

  describe('exclude processes from auto instrumentation', () => {
    let npmProcess;
    let appUnderTestPid;

    afterEach(() => {
      if (npmProcess) {
        npmProcess.kill();
      }
      if (appUnderTestPid) {
        process.kill(appUnderTestPid);
      }
    });

    it('should ignore npm but instrument the actual application', async () => {
      const appPort = portfinder();
      const env = _.assign({}, process.env, {
        NODE_OPTIONS: '--require @instana/collector/src/immediate',
        INSTANA_AGENT_PORT: agentControls.agentPort,
        INSTANA_LOG_LEVEL: 'info',
        APP_PORT: appPort
      });

      // Start a Node.js application via npm start, this will start two Node.js processes: npm and the actual
      // application under test (as a child process of npm).
      npmProcess = spawn('npm', ['start'], {
        shell: true,
        cwd: versionDir,
        stdio: config.getAppStdio(),
        env
      });

      // Wait until the application under test is up.
      appUnderTestPid = await retry(() =>
        fetch(`http://localhost:${appPort}/pid`, {
          url: `http://localhost:${appPort}/pid`,
          method: 'GET',
          headers: {
            'X-INSTANA-L': '0'
          }
        }).then(response => {
          return response.json();
        })
      );
      const npmPid = npmProcess.pid;

      // Make sure the application under test contacted the agent.
      await agentControls.waitUntilAppIsCompletelyInitialized(appUnderTestPid);

      // Also give the npm process time to report to the agent. (We expect it does not report to the agent but we do not
      // want the test to pass only because it did not _yet_ report to the agent.)
      await delay(500);

      // Make sure the npm process did not report to the agent even after waiting for that to happen.
      const pidsThatContactedTheAgent = await agentControls.getDiscoveries();
      expect(pidsThatContactedTheAgent[appUnderTestPid]).to.exist;
      expect(pidsThatContactedTheAgent[npmPid]).to.not.exist;
    });
  });
};
