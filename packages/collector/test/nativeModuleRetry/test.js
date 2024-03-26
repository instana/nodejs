/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const { expect } = require('chai');
const fs = require('node:fs/promises');
const os = require('os');
const path = require('path');

const config = require('../../../core/test/config');
const { retry } = require('../../../core/test/test_util');
const ProcessControls = require('../test_util/ProcessControls');
const globalAgent = require('../globalAgent');

describe('retry loading native addons', function () {
  const timeout = Math.max(config.getTestTimeout(), 20000);
  this.timeout(timeout);

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  const metricAddonsTestConfigs = [
    {
      name: 'event-loop-stats',
      nativeModuleFolder: path.dirname(require.resolve('event-loop-stats/package.json')),
      backupPath: path.join(os.tmpdir(), 'event-loop-stats-backup'),
      check: ([aggregated]) => {
        const libuv = aggregated.libuv;
        expect(libuv).to.exist;
        expect(libuv).to.be.an('object');

        expect(libuv.statsSupported).to.be.true;
        expect(libuv.min).to.be.a('number');
        expect(libuv.max).to.be.a('number');
        expect(libuv.sum).to.be.a('number');
        expect(libuv.lag).to.be.a('number');
      }
    },
    {
      name: 'gcstats.js',
      nativeModuleFolder: path.dirname(require.resolve('gcstats.js/package.json')),
      backupPath: path.join(os.tmpdir(), 'gcstats.js-backup'),
      check: ([aggregated]) => {
        // The for loop above ensures that the first metric POST that had the gc payload
        // had gc.statsSupported == undefined. Now we check that at some point, the supported flag changed to true.
        const gc = aggregated.gc;
        expect(gc).to.exist;
        expect(gc).to.be.an('object');

        expect(gc.statsSupported).to.be.true;
        expect(gc.minorGcs).to.exist;
        expect(gc.majorGcs).to.exist;
      }
    }
  ];

  describe('metrics are activated lazily by copying precompiled binaries when they are initially missing', () => {
    metricAddonsTestConfigs.forEach(runCopyPrecompiledForNativeAddonTest.bind(this, agentControls));
  });
});

function runCopyPrecompiledForNativeAddonTest(agentControls, opts) {
  let controls;

  const rename = async (oldPath, newPath) => {
    try {
      await fs.rename(oldPath, newPath);
    } catch (err) {
      if (err.code === 'EXDEV') {
        await copyFolder(oldPath, newPath);
        await fs.rmdir(oldPath, { recursive: true });
      } else {
        throw err;
      }
    }
  };

  async function copyFolder(src, dest) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });

    const copyPromises = entries.map(async entry => {
      const srcPath = `${src}/${entry.name}`;
      const destPath = `${dest}/${entry.name}`;

      if (entry.isDirectory()) {
        await copyFolder(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    });

    await Promise.all(copyPromises);
  }

  before(async () => {
    controls = new ProcessControls({
      appPath: path.join(__dirname, 'app'),
      agentControls,
      useGlobalAgent: true
      // by default, only copying precompiled binaries is enabled and recompiling them on demand is not
    });

    await controls.startAndWaitForAgentConnection();
  });

  beforeEach(async () => {
    await agentControls.clearReceivedTraceData();
  });

  after(async () => {
    await controls.stop();
  });

  afterEach(async () => {
    await controls.clearIpcMessages();
  });

  describe(opts.name, () => {
    before(async () => {
      // remove the dependency temporarily
      await rename(opts.nativeModuleFolder, opts.backupPath);
    });

    after(async () => {
      await rename(opts.backupPath, opts.nativeModuleFolder);
    });

    it('metrics from native add-ons should become available at some point', () =>
      retry(() =>
        Promise.all([
          //
          agentControls.getAggregatedMetrics(controls.getPid()),
          agentControls.getEvents()
        ]).then(opts.check)
      ));
  });
}
