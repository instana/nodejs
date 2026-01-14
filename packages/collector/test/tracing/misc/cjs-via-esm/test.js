/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const semver = require('semver');
const path = require('path');
const expect = require('chai').expect;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');
const { retry } = require('../../../../../core/test/test_util');

const mochaSuiteFn =
  supportedVersion(process.versions.node) && semver.gte(process.versions.node, '18.19.0') ? describe : describe.skip;

mochaSuiteFn('tracing/cjs-via-esm', function () {
  this.timeout(1000 * 60);
  globalAgent.setUpCleanUpHooks();

  let controls;
  const agentControls = globalAgent.instance;

  before(async () => {
    const rootFolder = path.join(__dirname, '..', '..', '..', '..');

    controls = new ProcessControls({
      useGlobalAgent: true,
      dirname: __dirname,
      enableOtelIntegration: true,
      execArgv: ['--experimental-loader', `${rootFolder}/esm-loader.mjs`]
    });

    await controls.startAndWaitForAgentConnection();
  });

  beforeEach(async () => {
    await agentControls.clearReceivedTraceData();
  });

  after(async () => {
    await controls.stop();
  });

  it('must trace', async () => {
    await controls.sendRequest({
      path: '/trigger'
    });

    return retry(async () => {
      const spans = await agentControls.getSpans();

      expect(spans.length).to.equal(4);

      const pinoSpan = spans.find(span => span.n === 'log.pino');
      expect(pinoSpan).to.exist;

      const httpServerSpan = spans.find(span => span.n === 'node.http.server');
      expect(httpServerSpan).to.exist;

      const httpClientSpan = spans.find(span => span.n === 'node.http.client');
      expect(httpClientSpan).to.exist;
      expect(httpClientSpan.data).to.exist;
    });
  });
});
