/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const expect = require('chai').expect;
const path = require('path');
const os = require('os');
const semver = require('semver');
const { mkdtempSync } = require('fs');
const rimraf = require('rimraf');

const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('@instana/core/test/config');
const testUtils = require('@instana/core/test/test_util');
const ProcessControls = require('../../../../test_util/ProcessControls');
const globalAgent = require('../../../../globalAgent');

const mochaSuiteFn =
  supportedVersion(process.versions.node) && semver.gte(process.versions.node, '18.0.0') ? describe : describe.skip;

mochaSuiteFn('[CJS] tracing/sdk/multiple_installations', function () {
  this.timeout(config.getTestTimeout() * 2);

  const tmpDirPath = path.join(os.tmpdir(), '@instana-collector-test-prevent-multiple-installations');
  const tmpDir = mkdtempSync(tmpDirPath);
  const pathToSeparateInstanaCollector = path.join(tmpDir, 'node_modules', '@instana', 'collector');

  const agentControls = globalAgent.instance;
  globalAgent.setUpCleanUpHooks();

  let controls;

  before(async () => {
    testUtils.runCommandSync('npm install --production --no-optional --no-audit @instana/collector', tmpDir);

    controls = new ProcessControls({
      useGlobalAgent: true,
      cwd: path.join(__dirname, 'src'),
      appPath: path.join(__dirname, 'src', 'app'),
      env: {
        NODE_OPTIONS: '--require ./load-instana.js',
        INSTANA_COLLECTOR_PATH: pathToSeparateInstanaCollector
      }
    });

    await controls.startAndWaitForAgentConnection();
  });

  beforeEach(async () => {
    await agentControls.clearReceivedTraceData();
  });

  after(done => {
    rimraf(tmpDir, done);
  });

  after(async () => {
    await controls.stop();
  });

  afterEach(async () => {
    await controls.clearIpcMessages();
  });

  it('should trace http & sdk spans', async () => {
    let spans = await agentControls.getSpans();
    expect(spans.length).to.eql(0);

    await controls.sendRequest({ path: '/trace' });
    await testUtils.delay(3 * 1000);

    spans = await agentControls.getSpans();

    // 2x SDK, 1x HTTP ENTRY
    expect(spans.length).to.eql(3);

    testUtils.verifyEntrySpan({
      spanName: 'node.http.server',
      spans,
      withError: false,
      pid: String(controls.getPid()),
      dataProperty: 'http',
      extraTests: span => {
        expect(span.data.http.url).to.eql('/trace');
      }
    });

    const entrySdk = testUtils.verifyEntrySpan({
      spanName: 'sdk',
      spans,
      withError: false,
      pid: String(controls.getPid()),
      extraTests: span => {
        expect(span.data.sdk.name).to.eql('entryspan');
      }
    });

    testUtils.verifyIntermediateSpan({
      spanName: 'sdk',
      spans,
      parent: entrySdk,
      withError: false,
      pid: String(controls.getPid()),
      extraTests: span => {
        expect(span.data.sdk.name).to.eql('intermediate-span-name');
      }
    });
  });
});
