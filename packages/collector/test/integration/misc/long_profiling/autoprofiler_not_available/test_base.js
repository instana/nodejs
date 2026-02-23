/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

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

  before(async () => {
    console.log(`Removing @instana/autoprofile dependency from ${__dirname}`);
    // If you remove the whole folder "node_modules/@instana/autoprofile",
    // npm will load packages/autoprofile from the workspace root.
    // One possible solution is to install the app version folders in a tmp folder
    // and symlink the folders to the test folders.
    execSync('rm -rf node_modules/@instana/autoprofile/index.js', { cwd: __dirname, stdio: 'inherit' });

    await agentControls.startAgent();

    controls = new ProcessControls({
      dirname: __dirname,
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
