/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const os = require('os');
const { expect } = require('chai');
const { execSync } = require('child_process');
const { retry } = require('@_local/core/test/test_util');
const config = require('@_local/core/test/config');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const { AgentStubControls } = require('@_local/collector/test/apps/agentStubControls');

module.exports = function () {
  this.timeout(config.getTestTimeout());

  const agentControls = new AgentStubControls();
  let controls;
  let tmpDir;

  before(async () => {
    tmpDir = os.tmpdir();

    execSync('./prepare.sh', { cwd: __dirname, stdio: 'inherit' });
    execSync(`mv ./*.tgz ${tmpDir}`, { cwd: __dirname, stdio: 'inherit' });
    execSync(`cp app.js ${tmpDir}`, { cwd: __dirname, stdio: 'inherit' });

    execSync('npm install --no-save --no-package-lock --prefix ./ ./core.tgz', {
      cwd: tmpDir,
      stdio: 'inherit'
    });

    execSync('npm install --no-save --no-package-lock --prefix ./ ./collector.tgz', {
      cwd: tmpDir,
      stdio: 'inherit'
    });

    execSync('rm -rf node_modules/@_local/autoprofile', { cwd: tmpDir, stdio: 'inherit' });

    await agentControls.startAgent();

    controls = new ProcessControls({
      dirname: tmpDir,
      agentControls,
      env: {
        INSTANA_AUTO_PROFILE: true
      }
    });

    await controls.start();
  });

  after(async () => {
    await controls.stop();
    await agentControls.stopAgent();
  });

  it('must fire monitoring event', async () => {
    await controls.sendRequest({
      method: 'GET',
      path: '/dummy'
    });

    return retry(async () => {
      const events = await agentControls.getMonitoringEvents();
      expect(events.length).to.be.at.least(1);
      expect(events[0].code).to.equal('nodejs_collector_native_addon_autoprofile_missing');

      const profiles = await agentControls.getProfiles();
      expect(profiles.length).to.equal(0);
    });
  });
};
