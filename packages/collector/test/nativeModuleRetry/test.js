'use strict';

const async = require('async');
const copy = require('recursive-copy');
const { assert, expect } = require('chai');
const fs = require('fs');
const os = require('os');
const path = require('path');
const rimraf = require('rimraf');
const semver = require('semver');
const tar = require('tar');

const config = require('../../../core/test/config');
const { expectAtLeastOneMatching, retry } = require('../../../core/test/test_util');
const ProcessControls = require('../test_util/ProcessControls');

const sharedMetricsNodeModules = path.join(__dirname, '..', '..', '..', 'shared-metrics', 'node_modules');
const collectorNodeModules = path.join(__dirname, '..', '..', 'node_modules');
const resourcesPath = path.join(__dirname, 'resources');

describe('retry loading native addons', function() {
  const timeout = Math.max(config.getTestTimeout(), 20000);
  this.timeout(timeout);
  const retryTimeout = timeout / 2;

  const agentControls = require('../apps/agentStubControls');
  agentControls.registerTestHooks();

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

  function netlinkwrapperTestConfig(controls) {
    return {
      name: 'netlinkwrapper',
      nodeModulesPath: collectorNodeModules,
      nativeModulePath: path.join(collectorNodeModules, 'netlinkwrapper'),
      backupPath: path.join(os.tmpdir(), 'netlinkwrapper-backup'),
      resourcesPath,
      corruptTarGzPath: path.join(resourcesPath, 'netlinkwrapper-corrupt.tar.gz'),
      corruptUnpackedPath: path.join(resourcesPath, 'netlinkwrapper'),
      check: data =>
        controls
          .sendRequest({
            method: 'POST',
            path: '/boom',
            simple: false,
            resolveWithFullResponse: true
          })
          .then(response => {
            assert.fail(response, 'no response', 'Unexpected response, server should have crashed.');
          })
          .catch(() => {
            const events = data[2];
            expect(events).to.have.lengthOf(1);
            expectAtLeastOneMatching(events, event => {
              expect(event.text).to.contain('Boom');
              expect(event.severity).to.equal(10);
            });
          })
    };
  }

  describe('metrics are activated lazily by copying precompiled binaries when they are initially missing', () => {
    const controls = new ProcessControls({
      appPath: path.join(__dirname, 'app'),
      env: { INSTANA_DEV_DISABLE_REBUILD_NATIVE_ADDONS: 'true' }
    }).registerTestHooks();

    metricAddonsTestConfigs.forEach(
      runCopyPrecompiledForNativeAddonTest.bind(this, agentControls, controls, retryTimeout)
    );
  });

  const mochaSuiteFn = semver.gte(process.versions.node, '10.0.0') ? describe : describe.skip;
  mochaSuiteFn('metrics are activated lazily by compiling on demand when they are initially missing', () => {
    const controls = new ProcessControls({
      appPath: path.join(__dirname, 'app'),
      env: { INSTANA_DEV_DISABLE_PRECOMPILED_NATIVE_ADDONS: 'true' }
    }).registerTestHooks();

    metricAddonsTestConfigs.forEach(
      runCompileOnDemandForNativeAddonTest.bind(this, agentControls, controls, retryTimeout)
    );
  });

  describe('netlinkwrapper is activated lazily by copying precompiled binaries when it is missing initially', () => {
    const controls = new ProcessControls({
      appPath: path.join(__dirname, 'app'),
      dontKillInAfterHook: true,
      env: { INSTANA_DEV_DISABLE_REBUILD_NATIVE_ADDONS: 'true' }
    }).registerTestHooks();

    runCopyPrecompiledForNativeAddonTest(agentControls, controls, retryTimeout, netlinkwrapperTestConfig(controls));
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
