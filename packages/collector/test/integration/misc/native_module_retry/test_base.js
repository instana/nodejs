/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const { expect } = require('chai');
const path = require('path');
const fs = require('fs');
const os = require('os');
const semver = require('semver');

const config = require('@_local/core/test/config');
const { retry, runCommandSync } = require('@_local/core/test/test_util');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const globalAgent = require('@_local/collector/test/globalAgent');
const { execSync } = require('child_process');

const tmpFolder = path.join(os.tmpdir(), 'native-module-retry', process.pid.toString());

module.exports = function () {
  // This test runs only on stable, even-numbered Node.js versions
  const majorVersion = parseInt(process.versions.node.split('.')[0], 10);
  const isOddVersion = majorVersion % 2 !== 0;
  const isPrerelease = Boolean(semver.prerelease(process.versions.node));

  const mochaSuiteFn = isOddVersion || isPrerelease ? describe.skip : describe;

  mochaSuiteFn('retry loading native addons', function () {
    this.timeout(config.getTestTimeout() * 5);

    globalAgent.setUpCleanUpHooks();
    const agentControls = globalAgent.instance;

    const metricAddonsTestConfigs = [
      {
        name: 'event-loop-stats',
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
        check: ([aggregated]) => {
          const gc = aggregated.gc;
          expect(gc).to.exist;
          expect(gc).to.be.an('object');

          expect(gc.statsSupported).to.be.true;
          expect(gc.minorGcs).to.exist;
          expect(gc.majorGcs).to.exist;
        }
      }
    ];

    metricAddonsTestConfigs.forEach(async opts => {
      describe(`${opts.name}: expect metrics to show up`, function () {
        let controls;

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
          execSync(`rm -rf ${tmpFolder}`, { cwd: __dirname, stdio: 'inherit' });
          execSync(`mkdir -p ${tmpFolder}`, { cwd: __dirname, stdio: 'inherit' });

          execSync(`cp app.js ${tmpFolder}/`, { cwd: __dirname, stdio: 'inherit' });

          // eslint-disable-next-line no-console
          console.log('Running npm install in', tmpFolder);
          execSync('rm -rf node_modules', { cwd: tmpFolder, stdio: 'inherit' });

          const copath = path.dirname(require.resolve('@_local/collector/package.json'));
          runCommandSync('npm pack', copath);

          const coversion = require('@_local/collector/package.json').version;
          runCommandSync(
            `npm install --production --no-optional --no-audit ${copath}/instana-collector-${coversion}.tgz`,
            tmpFolder
          );

          const corepath = path.dirname(require.resolve('@_local/core/package.json'));
          runCommandSync('npm pack', corepath);

          const coreversion = require('@_local/core/package.json').version;
          runCommandSync(
            `npm install  --prefix ./ --production --no-optional --no-audit ${corepath}/instana-core-${coreversion}.tgz`,
            tmpFolder
          );

          const sharedMetricsPath = path.dirname(require.resolve('@_local/shared-metrics/package.json'));
          runCommandSync('npm pack', sharedMetricsPath);

          const sharedMetricsVersion = require('@_local/shared-metrics/package.json').version;
          runCommandSync(
            // eslint-disable-next-line max-len
            `npm install  --prefix ./ --production --no-optional --no-audit ${sharedMetricsPath}/instana-shared-metrics-${sharedMetricsVersion}.tgz`,
            tmpFolder
          );

          // Remove the target c++ module
          execSync(`rm -rf node_modules/${opts.name}`, { cwd: tmpFolder, stdio: 'inherit' });

          if (fs.existsSync(path.join(tmpFolder, 'node_modules', opts.name))) {
            throw new Error('The module should not be present at this point');
          }

          // Currently we do not ship darwin prebuilds via shared-metrics
          const sharedMetricsAddons = path.join(sharedMetricsPath, 'addons', 'darwin');
          execSync(
            `cp -R ${sharedMetricsAddons} ${tmpFolder}/node_modules/@instana/shared-metrics/addons/`,
            {
              stdio: 'inherit'
            }
          );

          controls = new ProcessControls({
            appPath: path.join(tmpFolder, 'app'),
            agentControls,
            useGlobalAgent: true,
            env: {
              DEV_PATH: __dirname
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

        afterEach(async () => {
          await controls.clearIpcMessages();
        });

        describe(opts.name, () => {
          it('metrics from native add-ons should become available at some point', async () => {
            await retry(async () => {
              const [aggregatedMetrics, events] = await Promise.all([
                agentControls.getAggregatedMetrics(controls.getPid()),
                agentControls.getEvents()
              ]);
              await opts.check([aggregatedMetrics, events]);
            });
          });
          it('should successfully copy the precompiled binaries', async () => {
            await check(path.join(tmpFolder, 'node_modules', opts.name));
          });
        });
      });
    });
  });
};
