/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const expect = require('chai').expect;

const config = require('@_local/core/test/config');
const { delay, retry } = require('@_local/core/test/test_util');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const globalAgent = require('@_local/collector/test/globalAgent');

module.exports = function () {
  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  describe('Worker Thread', function () {
    this.timeout(config.getTestTimeout());

    describe('with app require (main thread only)', function () {
      let controls;

      before(async function () {
        controls = new ProcessControls({
          dirname: __dirname,
          cwd: __dirname,
          useGlobalAgent: true
        });

        await controls.startAndWaitForAgentConnection();
      });

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });

      after(async () => {
        await controls.stop();
      });

      it('should NOT send collector init message when Instana is not in worker', async () => {
        await controls.sendRequest({
          method: 'GET',
          path: '/generate-pdf?filename=test1.pdf'
        });

        await retry(async () => {
          const response = await controls.sendRequest({
            method: 'GET',
            path: '/check-messages'
          });

          expect(response.hasUnexpectedMessages).to.be.false;
          expect(response.instanaMessageCount).to.equal(0);
          expect(response.appMessageCount).to.be.at.least(1);
        });
      });
    });

    describe('with NODE_OPTIONS/pre-require (worker threads)', function () {
      let controls;

      before(async function () {
        controls = new ProcessControls({
          dirname: __dirname,
          cwd: __dirname,
          useGlobalAgent: true,
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

      it('should NOT send collector init message by default', async function () {
        this.timeout(20000);

        await controls.sendRequest({
          method: 'GET',
          path: '/create-worker'
        });

        await delay(3000);

        await controls.sendRequest({
          method: 'GET',
          path: '/generate-pdf?filename=test2.pdf'
        });

        await delay(500);

        await retry(async () => {
          const response = await controls.sendRequest({
            method: 'GET',
            path: '/check-messages'
          });

          expect(response.hasUnexpectedMessages).to.be.false;
          expect(response.instanaMessageCount).to.equal(0);

          const instanaMsg = response.allMessages.find(msg => msg === 'instana.collector.initialized');
          expect(instanaMsg).to.be.undefined;

          expect(response.appMessageCount).to.be.at.least(1);
        });
      });
    });
  });
};
