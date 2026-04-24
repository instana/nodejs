/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const expect = require('chai').expect;

const config = require('@_local/core/test/config');
const { delay, retry } = require('@_local/core/test/test_util');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const globalAgent = require('@_local/collector/test/globalAgent');

/**
 * Integration test to verify that Instana's worker thread instrumentation
 * sends unsolicited 'instana.collector.initialized' messages through parentPort,
 * which pollutes the application's message channel and causes data corruption.
 *
 * Issue: When Instana is enabled in a worker thread, it sends an internal
 * lifecycle message ('instana.collector.initialized') through parentPort.postMessage(),
 * which interferes with application-level communication between worker and main thread.
 *
 * This test simulates a PDF generation use case where:
 * 1. Main thread spawns a worker thread
 * 2. Worker thread generates PDF and sends structured data: { fileName: string, content: Buffer }
 * 3. Instana injects its own message: 'instana.collector.initialized'
 * 4. Application receives unexpected message types, causing downstream failures
 */
module.exports = function () {
  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  describe.only('Worker Thread ParentPort Pollution', function () {
    this.timeout(config.getTestTimeout());

    describe('with in-app require (main thread only)', function () {
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

      it('should NOT pollute parentPort with instana.collector.initialized when Instana is not in worker', async () => {
        await controls.sendRequest({
          method: 'GET',
          path: '/generate-pdf?filename=test1.pdf'
        });

        await retry(async () => {
          const response = await controls.sendRequest({
            method: 'GET',
            path: '/check-pollution'
          });

          expect(response.hasPollution).to.be.false;
          expect(response.instanaMessageCount).to.equal(0);
          expect(response.appMessageCount).to.be.at.least(1);
        });
      });
    });

    describe('with NODE_OPTIONS/pre-require (affects worker threads)', function () {
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

      it('SHOULD pollute parentPort with instana.collector.initialized)', async function () {
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
            path: '/check-pollution'
          });

          expect(response.hasPollution).to.be.true;
          expect(response.instanaMessageCount).to.be.at.least(1);

          const instanaMsg = response.allMessages.find(msg => msg === 'instana.collector.initialized');
          expect(instanaMsg).to.equal('instana.collector.initialized');

          expect(response.appMessageCount).to.be.at.least(1);
        });
      });
    });
  });
};
