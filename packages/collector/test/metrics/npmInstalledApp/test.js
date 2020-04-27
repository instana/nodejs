'use strict';

const path = require('path');
const expect = require('chai').expect;
const _ = require('lodash');

const config = require('../../../../core/test/config');
const testUtils = require('../../../../core/test/test_util');
const ProcessControls = require('../../test_util/ProcessControls');

describe('snapshot data and metrics/app deployed via npm install', function() {
  this.timeout(config.getTestTimeout());

  const agentControls = require('../../apps/agentStubControls');
  agentControls.registerTestHooks();
  const controls = new ProcessControls({
    appPath: path.join(__dirname, 'node_modules', 'npm-installed-test-app', 'app')
  }).registerTestHooks();

  it('must find main package.json and main node_modules', () =>
    testUtils.retry(() =>
      agentControls.getAllMetrics(controls.getPid()).then(allMetrics => {
        const deps = findMetric(allMetrics, ['dependencies']);
        expect(deps).to.be.an('object');
        expect(Object.keys(deps)).to.have.lengthOf(2);
        expect(deps['node-fetch']).to.equal('2.6.0');
        expect(deps['npm-installed-test-app']).to.equal('4.5.6');

        expect(findMetric(allMetrics, ['description'])).to.equal(
          'This is a test application that is deployed via npm install $appName.'
        );

        const directDeps = findMetric(allMetrics, ['directDependencies']);
        expect(directDeps).to.be.an('object');
        expect(Object.keys(directDeps)).to.have.lengthOf.at.least(1);
        expect(directDeps.dependencies['node-fetch']).to.equal('^2.6.0');

        expect(findMetric(allMetrics, ['keywords'])).to.deep.equal(['keyword3', 'keyword4']);
        expect(findMetric(allMetrics, ['name'])).to.equal('npm-installed-test-app');
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
