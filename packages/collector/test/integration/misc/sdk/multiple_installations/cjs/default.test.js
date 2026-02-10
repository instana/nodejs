/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const expect = require('chai').expect;
const path = require('path');
const os = require('os');
const { mkdtempSync } = require('fs');
const rimraf = require('rimraf');

const config = require('@_local/core/test/config');
const testUtils = require('@_local/core/test/test_util');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const globalAgent = require('@_local/collector/test/globalAgent');

describe('[CJS] sdk/multiple_installations', function () {
  this.timeout(config.getTestTimeout() * 2);

  const tmpDirPath = path.join(os.tmpdir(), '@instana-collector-test-prevent-multiple-installations');
  const tmpDir = mkdtempSync(tmpDirPath);
  const pathToSeparateInstanaCollector = path.join(tmpDir, 'node_modules', '@instana', 'collector');

  const copath = path.dirname(require.resolve('@_local/collector/package.json'));
  const corepath = path.dirname(require.resolve('@_local/core/package.json'));
  const sharedMetricsPath = path.dirname(require.resolve('@_local/shared-metrics/package.json'));

  const agentControls = globalAgent.instance;
  globalAgent.setUpCleanUpHooks();

  let controls;

  before(async () => {
    testUtils.runCommandSync('npm pack', copath);

    const coversion = require('@_local/collector/package.json').version;
    testUtils.runCommandSync(
      `npm install --production --no-optional --no-audit ${copath}/instana-collector-${coversion}.tgz`,
      tmpDir
    );

    testUtils.runCommandSync('npm pack', corepath);

    const coreversion = require('@_local/core/package.json').version;
    testUtils.runCommandSync(
      `npm install --production --no-optional --no-audit ${corepath}/instana-core-${coreversion}.tgz`,
      tmpDir
    );

    testUtils.runCommandSync('npm pack', sharedMetricsPath);

    const smVersion = require('@_local/shared-metrics/package.json').version;
    testUtils.runCommandSync(
      `npm install --production --no-optional --no-audit ${sharedMetricsPath}/instana-shared-metrics-${smVersion}.tgz`,
      tmpDir
    );

    controls = new ProcessControls({
      dirname: __dirname,
      useGlobalAgent: true,
      cwd: path.join(__dirname, 'src'),
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

    return testUtils.retry(async () => {
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
});
