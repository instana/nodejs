/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const expect = require('chai').expect;

const config = require('@_local/core/test/config');
const { delay, retry } = require('@_local/core/test/test_util');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const globalAgent = require('@_local/collector/test/globalAgent');

module.exports = function () {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  describe('with in-app require main thread but not in worker thread', () => {
    let controls;

    before(async () => {
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

    it('will neither report metrics nor spans from a worker thread', async () => {
      await verify({
        controls,
        expectSpans: false
      });
    });
  });

  describe('with in-app require in main thread and in worker thread', () => {
    let controls;

    before(async () => {
      controls = new ProcessControls({
        dirname: __dirname,
        cwd: __dirname,
        useGlobalAgent: true,
        env: {
          REQUIRE_INSTANA_IN_WORKER_THREAD: true
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

    it('must not report metrics from a worker thread', async () => {
      await verify({
        controls,
        expectSpans: true
      });
    });
  });

  describe('with NODE_OPTIONS/pre-require', () => {
    let controls;

    before(async () => {
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

    it('must not report metrics from a worker thread', async () => {
      await verify({
        controls,
        expectSpans: true
      });
    });
  });

  async function verify({ controls, expectSpans }) {
    let allMetrics;
    let allNames;

    await retry(async () => {
      allMetrics = await agentControls.getAllMetrics(controls.getPid());
      allNames = [];
      allMetrics.forEach(metrics => {
        if (metrics.data.name) {
          allNames.push(metrics.data.name);
        }
      });
      expect(allNames).to.contain('worker-thread-test-app');
    });

    await delay(800);

    if (expectSpans) {
      await retry(async () => {
        const spans = await agentControls.getSpans(controls.getPid());
        expect(spans).is.not.empty;
        expect(spans[0].n).equals('node.http.server');
      });
    } else {
      const spans = await agentControls.getSpans(controls.getPid());
      expect(spans).to.be.empty;
    }

    allMetrics = await agentControls.getAllMetrics(controls.getPid());
    allMetrics.forEach(metrics => {
      expect(metrics.data.name).to.not.equal('worker-thread-helper-module');
    });
  }
};
