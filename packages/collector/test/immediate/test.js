'use strict';

const { expect } = require('chai');

const config = require('../../../core/test/config');
const ProcessControls = require('../test_util/ProcessControls');
const globalAgent = require('../globalAgent');

const agentControls = globalAgent.instance;

describe('collector/src/immediate', function() {
  globalAgent.setUpCleanUpHooks();

  this.timeout(config.getTestTimeout());

  describe('an application instrumented via NODE_OPTIONS', () => {
    const controls = new ProcessControls({
      useGlobalAgent: true,
      dirname: __dirname,
      cwd: __dirname,
      env: {
        NODE_OPTIONS: '--require ../../src/immediate'
      }
    });
    ProcessControls.setUpHooks(controls);

    it('should have connected to the agent', async () => {
      // Make sure the npm process did not report to the agent even after waiting for that to happen.
      const pidsThatContactedTheAgent = await agentControls.getDiscoveries();
      expect(pidsThatContactedTheAgent[controls.getPid()]).to.exist;
    });
  });
});
