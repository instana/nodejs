/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const async = require('async');
const copy = require('recursive-copy');
const { expect } = require('chai');
const fs = require('fs');
const os = require('os');
const path = require('path');
const rimraf = require('rimraf');
const semver = require('semver');
const tar = require('tar');

const config = require('../../../core/test/config');
const { retry } = require('../../../core/test/test_util');
const ProcessControls = require('../test_util/ProcessControls');
const globalAgent = require('../globalAgent');

const sharedMetricsNodeModules = path.join(__dirname, '..', '..', '..', 'shared-metrics', 'node_modules');
const resourcesPath = path.join(__dirname, 'resources');

describe('retry loading native addons', function () {
  const timeout = Math.max(config.getTestTimeout(), 20000);
  this.timeout(timeout);
  const retryTimeout = timeout / 2;

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  const metricAddonsTestConfigs = [
    {
      name: 'event-loop-stats',
      nodeModulesPath: sharedMetricsNodeModules,
      nativeModulePath: path.join(sharedMetricsNodeModules, 'event-loop-stats'),
      backupPath: path.join(os.tmpdir(), 'event-loop-stats-backup'),
      resourcesPath,
      corruptTarGzPath: path.join(resourcesPath, 'event-loop-stats-corrupt.tar.gz'),
      corruptUnpackedPath: path.join(resourcesPath, 'event-loop-stats'),
      check: ([allMetrics, aggregated]) => {
        // check that libuv stats are initially reported as unsupported
        let foundAtLeastOneUnsupported;
        for (let i = 0; i < allMetrics.length; i++) {
          if (allMetrics[i].data.libuv) {
            expect(allMetrics[i].data.libuv.statsSupported).to.not.exist;
            foundAtLeastOneUnsupported = true;
            break;
          }
        }
        expect(foundAtLeastOneUnsupported).to.be.true;

        // The for loop above ensures that the first metric POST that had the libuv payload
        // had libuv.statsSupported === false. Now we check that at some point, the supported flag changed to true.
        const libuv = aggregated.libuv;
        expect(libuv).to.exist;
        expect(libuv).to.be.an('object');
        // console.log('111111111111111!!!!1111!!!!!!!111!!!!!111!!!11111!!!!11111!!!!111!!!!!', libuv);
        expect(libuv.statsSupported).to.be.true;
        expect(libuv.min).to.be.a('number');
        expect(libuv.max).to.be.a('number');
        expect(libuv.sum).to.be.a('number');
        expect(libuv.lag).to.be.a('number');
      }
    },
    {
      name: 'gcstats.js',
      nodeModulesPath: sharedMetricsNodeModules,
      nativeModulePath: path.join(sharedMetricsNodeModules, 'gcstats.js'),
      backupPath: path.join(os.tmpdir(), 'gcstats.js-backup'),
      resourcesPath,
      corruptTarGzPath: path.join(resourcesPath, 'gcstats.js-corrupt.tar.gz'),
      corruptUnpackedPath: path.join(resourcesPath, 'gcstats.js'),
      check: ([allMetrics, aggregated]) => {
        // check that gc stats are initially reported as unsupported
        let foundAtLeastOneUnsupported;
        for (let i = 0; i < allMetrics.length; i++) {
          if (allMetrics[i].data.libuv) {
            // console.log('>>>>>> LIBUV:', allMetrics[i].data.libuv, allMetrics[i].data.gc);
            // console.log('>>>>>> GC', allMetrics[i].data.gc);
            expect(allMetrics[i].data.gc.statsSupported).to.not.exist;
            foundAtLeastOneUnsupported = true;
            break;
          }
        }
        expect(foundAtLeastOneUnsupported).to.be.true;

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

  // eslint-disable-next-line mocha/no-exclusive-tests
  describe.only('metrics are activated lazily by copying precompiled binaries when they are initially missing', () => {
    const controls = new ProcessControls({
      appPath: path.join(__dirname, 'app'),
      agentControls,
      useGlobalAgent: true
      // by default, only copying precompiled binaries is enabled and recompiling them on demand is not
    }).registerTestHooks();

    metricAddonsTestConfigs.forEach(
      runCopyPrecompiledForNativeAddonTest.bind(this, agentControls, controls, retryTimeout)
    );
  });

  const mochaSuiteFn = semver.gte(process.versions.node, '10.0.0') ? describe : describe.skip;
  mochaSuiteFn('metrics are activated lazily by compiling on demand when they are initially missing', () => {
    const controls = new ProcessControls({
      appPath: path.join(__dirname, 'app'),
      useGlobalAgent: true,
      env: {
        INSTANA_COPY_PRECOMPILED_NATIVE_ADDONS: 'false',
        INSTANA_REBUILD_NATIVE_ADDONS_ON_DEMAND: 'true'
      }
    }).registerTestHooks();

    metricAddonsTestConfigs.forEach(
      runCompileOnDemandForNativeAddonTest.bind(this, agentControls, controls, retryTimeout)
    );
  });
});

function runCopyPrecompiledForNativeAddonTest(agentControls, controls, retryTimeout, opts) {
  describe(opts.name, () => {
    before(done => {
      // remove the dependency temporarily
      async.series([fs.rename.bind(null, opts.nativeModulePath, opts.backupPath)], done);
    });

    after(done => {
      // restore the dependency after running the test
      async.series(
        [
          //
          rimraf.bind(null, opts.nativeModulePath),
          fs.rename.bind(null, opts.backupPath, opts.nativeModulePath)
        ],
        done
      );
    });

    it('metrics from native add-ons should become available at some point', () =>
      retry(
        () =>
          Promise.all([
            //
            agentControls.getAllMetrics(controls.getPid()),
            agentControls.getAggregatedMetrics(controls.getPid()),
            agentControls.getEvents()
          ]).then(opts.check),
        retryTimeout
      ));
  });
}

function runCompileOnDemandForNativeAddonTest(agentControls, controls, retryTimeout, opts) {
  describe(opts.name, () => {
    before(done => {
      async.series(
        [
          tar.x.bind(null, {
            cwd: opts.resourcesPath,
            file: opts.corruptTarGzPath
          }),
          fs.rename.bind(null, opts.nativeModulePath, opts.backupPath),
          copy.bind(null, opts.corruptUnpackedPath, opts.nativeModulePath)
        ],
        done
      );
    });

    after(done => {
      async.series(
        [
          rimraf.bind(null, opts.nativeModulePath),
          rimraf.bind(null, opts.corruptUnpackedPath),
          fs.rename.bind(null, opts.backupPath, opts.nativeModulePath)
        ],
        done
      );
    });

    it('metrics from native add-ons should become available at some point', () =>
      retry(
        () =>
          Promise.all([
            //
            agentControls.getAllMetrics(controls.getPid()),
            agentControls.getAggregatedMetrics(controls.getPid()),
            agentControls.getEvents()
          ]).then(opts.check),
        retryTimeout
      ));
  });
}
