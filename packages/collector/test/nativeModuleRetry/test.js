/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const async = require('async');
const { expect } = require('chai');
const fs = require('fs');
const os = require('os');
const path = require('path');
const rimraf = require('rimraf');

const config = require('../../../core/test/config');
const { retry } = require('../../../core/test/test_util');
const ProcessControls = require('../test_util/ProcessControls');
const globalAgent = require('../globalAgent');

describe('retry loading native addons', function () {
  const timeout = Math.max(config.getTestTimeout(), 20000);
  this.timeout(timeout);
  const retryTimeout = timeout / 2;

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  const metricAddonsTestConfigs = [
    {
      name: 'event-loop-stats',
      nativeModulePath: require.resolve('event-loop-stats'),
      backupPath: path.join(os.tmpdir(), 'event-loop-stats-backup'),
      check: ([allMetrics, aggregated]) => {
        // check that libuv stats are initially reported as unsupported
        let foundAtLeastOneUnsupported;
        for (let i = 0; i < allMetrics.length; i++) {
          if (allMetrics[i].data.libuv) {
            expect(allMetrics[i].data.libuv.statsSupported).to.be.false;
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
      nativeModulePath: require.resolve('gcstats.js'),
      backupPath: path.join(os.tmpdir(), 'gcstats.js-backup'),
      check: ([allMetrics, aggregated]) => {
        // check that gc stats are initially reported as unsupported
        let foundAtLeastOneUnsupported;
        for (let i = 0; i < allMetrics.length; i++) {
          if (allMetrics[i].data.libuv) {
            expect(allMetrics[i].data.gc.statsSupported).to.be.false;
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

  describe('metrics are activated lazily by copying precompiled binaries when they are initially missing', () => {
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
