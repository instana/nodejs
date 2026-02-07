/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const expect = require('chai').expect;
const path = require('path');

const config = require('../../../../core/test/config');
const { delay, retry } = require('../../../../core/test/test_util');
const ProcessControls = require('../../test_util/ProcessControls');
const supportedVersion = require('@_local/core').tracing.supportedVersion;
const globalAgent = require('../../globalAgent');

// See https://instana.kanbanize.com/ctrl_board/56/cards/48699/details/ for more details on worker threads.

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('worker threads', function () {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  describe('with in-app require main thread but not in worker thread', () => {
    let controls;

    before(async () => {
      controls = new ProcessControls({
        appPath: path.join(__dirname, 'app'),
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
        appPath: path.join(__dirname, 'app'),
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
        appPath: path.join(__dirname, 'app'),
        cwd: __dirname,
        useGlobalAgent: true,
        env: {
          NODE_OPTIONS: '--require ../../../src/immediate'
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

    // First, make sure that the announce from the main thread has happened by retrying until we find
    //   (a) a metric object that has a "name" attribute, and
    //   (b) where the value for "name" is the expected application name (from the main thread).
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

    // We have made sure that the main thread has announced itself. Now we give the worker thread a chance to announce
    // itself and send metrics. Actually, we do _not_ want the worker thread to send metrics on its own, but to verify
    // that this does not happen, we need to wait a bit so that the test actually would fail if the worker thread sent
    // metrics.
    await delay(800);

    // Check whether we capture spans from the worker thread. At the moment, we only get spans from worker spans under
    // certain circumstances, these expectations will need to change when we capture spans from all worker threads
    // independent of how the main thread is instrumented.
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

    // Verify that the worker thread did not report metrics/snapshot data.
    allMetrics = await agentControls.getAllMetrics(controls.getPid());
    allMetrics.forEach(metrics => {
      expect(metrics.data.name).to.not.equal('worker-thread-helper-module');
    });
  }
});
