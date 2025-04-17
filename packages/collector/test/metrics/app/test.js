/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

/* eslint-disable no-console */

const _ = require('lodash');
const expect = require('chai').expect;
const { execSync } = require('child_process');
const path = require('path');

const config = require('../../../../core/test/config');
const { retry } = require('../../../../core/test/test_util');
const ProcessControls = require('../../test_util/ProcessControls');
const globalAgent = require('../../globalAgent');

describe('snapshot data and metrics', function () {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;
  let controls;

  before(async () => {
    const cwd = __dirname;
    console.log(`Running npm install in ${cwd}.`);
    const npmInstallOutput = execSync('npm install --no-audit', { cwd });
    console.log(`Done with running npm install in ${cwd}: ${npmInstallOutput}`);

    controls = new ProcessControls({
      appPath: path.join(__dirname, 'app'),
      args: ['foo', 'bar', 'baz'],
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

  it('must report metrics from a running process', () =>
    retry(() =>
      Promise.all([
        //
        agentControls.getAllMetrics(controls.getPid()),
        agentControls.getAggregatedMetrics(controls.getPid())
      ]).then(([allMetrics, aggregated]) => {
        expect(findMetric(allMetrics, ['activeHandles'])).to.exist;
        expect(findMetric(allMetrics, ['activeRequests'])).to.exist;

        const args = findMetric(allMetrics, ['args']);
        expect(args).to.be.an('array');
        expect(args).to.have.lengthOf(5);
        expect(args[0]).to.contain('node');
        expect(args[1]).to.contain('packages/collector/test/metrics/app/app');
        expect(args[2]).to.equal('foo');
        expect(args[3]).to.equal('bar');
        expect(args[4]).to.equal('baz');

        const deps = findMetric(allMetrics, ['dependencies']);
        expect(deps).to.be.an('object');

        expect(Object.keys(deps)).to.have.lengthOf(1);
        expect(deps['node-fetch']).to.equal('2.6.0');

        expect(findMetric(allMetrics, ['description'])).to.equal(
          'This is a test application to test snapshot and metrics data.'
        );

        const directDeps = findMetric(allMetrics, ['directDependencies']);
        expect(directDeps).to.be.an('object');
        expect(Object.keys(directDeps)).to.have.lengthOf.at.least(1);
        expect(directDeps.dependencies['node-fetch']).to.equal('^2.6.0');

        expect(findMetric(allMetrics, ['execArgs'])).to.be.an('array');
        expect(findMetric(allMetrics, ['execArgs'])).to.be.empty;

        expect(findMetric(allMetrics, ['gc', 'minorGcs'])).to.exist;
        expect(findMetric(allMetrics, ['gc', 'majorGcs'])).to.exist;

        const gc = aggregated.gc;
        expect(gc).to.be.an('object');
        expect(gc.statsSupported).to.be.true;
        expect(findMetric(allMetrics, ['healthchecks'])).to.exist;
        expect(findMetric(allMetrics, ['heapSpaces'])).to.exist;
        expect(findMetric(allMetrics, ['http'])).to.exist;
        expect(findMetric(allMetrics, ['keywords'])).to.deep.equal(['keyword1', 'keyword2']);
        const libuv = aggregated.libuv;
        expect(libuv).to.exist;
        expect(libuv).to.be.an('object');
        expect(libuv.statsSupported).to.be.true;
        expect(libuv.min).to.be.a('number');
        expect(libuv.max).to.be.a('number');
        expect(libuv.sum).to.be.a('number');
        expect(libuv.lag).to.be.a('number');
        expect(findMetric(allMetrics, ['memory'])).to.exist;
        expect(findMetric(allMetrics, ['name'])).to.equal('metrics-test-app');
        expect(findMetric(allMetrics, ['pid'])).to.equal(controls.getPid());
        expect(findMetric(allMetrics, ['versions'])).to.exist;
        expect(`v${findMetric(allMetrics, ['versions', 'node'])}`).to.equal(process.version);
      })
    ));
});

function findMetric(allMetrics, _path) {
  for (let i = allMetrics.length - 1; i >= 0; i--) {
    const value = _.get(allMetrics[i], ['data'].concat(_path));
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}
