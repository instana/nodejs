/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const { expect } = require('chai');
const fsPromise = require('node:fs/promises');
const os = require('os');
const path = require('path');
const fs = require('fs');

const config = require('../../../core/test/config');
const { retry } = require('../../../core/test/test_util');
const ProcessControls = require('../test_util/ProcessControls');
const globalAgent = require('../globalAgent');

/**
 * Test suite for verifying the fallback mechanism for loading native add-ons.
 *
 * This test ensures that if a native add-on (such as event-loop-stats or gcstats.js) cannot be loaded initially,
 * the system correctly falls back to using precompiled versions of these add-ons. This ensures the application remains
 * functions as expected even if the native module is missing or cannot be compiled. The function `attemptRequire`,
 * defined here: https://github.com/instana/nodejs/blob/main/packages/shared-metrics/src/util/nativeModuleRetry.js#L111
 * is used for the initial attempt to load the native add-on module. It tries to require the native module from the
 * root. If this attempt fails, the fallback mechanism is triggered.
 *
 * **Issue with npm Workspaces**:
 *
 * With `npm workspaces`, dependencies are installed in the root `node_modules` folder instead of individual
 * package `node_modules` folders. This can complicate managing native modules and their precompiled binaries,
 * as the fallback mechanism must copy to the correct path. This test verifying that precompiled binaries are copied
 * and loaded correctly to the @instana/shared-metrics/node_modules folder.
 *
 * **Test Design**:
 *
 * 1. **Setup**:
 *    - The installed native module is temporarily moved to a backup directory to simulate its absence. As the system
 *      first tries to require the native module from the root, so we relocate the modules.
 *
 * 2. **Fallback Mechanism**:
 *    - The test checks if the fallback mechanism correctly copies the precompiled binaries to the appropriate directory
 *      when the native module is not found.
 *
 * Note: Currently, we are not addressing the npm workspace issues with prebuilds because there is a
 * potential migration to a tool like prebuildify in the future, which might handle these issues differently.
 * refs: INSTA-770
 */

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
      await fsPromise.rename(oldPath, newPath);
    } catch (err) {
      if (err.code === 'EXDEV' || err.code === 'ENOTEMPTY') {
        await copyFolder(oldPath, newPath);
        await fsPromise.rm(oldPath, { recursive: true });
      } else {
        throw err;
      }
    }
  };

  async function copyFolder(src, dest) {
    await fsPromise.mkdir(dest, { recursive: true });
    const entries = await fsPromise.readdir(src, { withFileTypes: true });

    const copyPromises = entries.map(async entry => {
      const srcPath = `${src}/${entry.name}`;
      const destPath = `${dest}/${entry.name}`;

      if (entry.isDirectory()) {
        await copyFolder(srcPath, destPath);
      } else {
        await fsPromise.copyFile(srcPath, destPath);
      }
    });

    await Promise.all(copyPromises);
  }
  const check = async copiedBinaryPath => {
    const targetDirectory = 'precompiled';

    const directoryPath = path.join(copiedBinaryPath, targetDirectory);
    ['binding.gyp', 'build', 'package.json', 'src'].forEach(file => {
      expect(fs.existsSync(path.join(directoryPath, file))).to.be.true;
    });

    if (directoryPath.includes('event-loop-stats')) {
      expect(fs.existsSync(path.join(directoryPath, 'src', 'eventLoopStats.cc'))).to.be.true;
      expect(fs.existsSync(path.join(directoryPath, 'src', 'eventLoopStats.js'))).to.be.true;
      expect(fs.existsSync(path.join(directoryPath, 'build', 'Release', 'eventLoopStats.node'))).to.be.true;
    }

    if (directoryPath.includes('gcstats.js')) {
      expect(fs.existsSync(path.join(directoryPath, 'src', 'gcstats.cc'))).to.be.true;
      expect(fs.existsSync(path.join(directoryPath, 'src', 'gcstats.js'))).to.be.true;
      expect(fs.existsSync(path.join(directoryPath, 'build', 'Release', 'gcstats.node'))).to.be.true;
    }
  };

  before(async () => {
    // remove the dependency temporarily
    await rename(opts.nativeModuleFolder, opts.backupPath);

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
    await rename(opts.backupPath, opts.nativeModuleFolder);
  });

  afterEach(async () => {
    await controls.clearIpcMessages();
  });

  describe(opts.name, () => {
    it('metrics from native add-ons should become available at some point', () =>
      retry(() =>
        Promise.all([
          //
          agentControls.getAggregatedMetrics(controls.getPid()),
          agentControls.getEvents()
        ]).then(opts.check)
      ));
    it('should successfully copy the precompiled binaries', async () => {
      // During testing, the precompiled binaries are copied to the node_modules/@instana/shared-metrics directory.
      // However, npm workspaces installs the packages in the root node_modules directory.
      const copiedBinaryPath = require('path').join(
        __dirname,
        '..',
        '..',
        '..',
        'shared-metrics',
        'node_modules',
        `${opts.name}`
      );
      await check(copiedBinaryPath);
    });
  });
}
