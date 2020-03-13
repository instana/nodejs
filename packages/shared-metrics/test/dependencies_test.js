'use strict';

const expect = require('chai').expect;

const testUtils = require('../../core/test/test_util');
const dependencies = require('../src/dependencies');

describe('metrics.dependencies', () => {
  it('should export a dependencies payload prefix', () => {
    expect(dependencies.payloadPrefix).to.equal('dependencies');
  });

  it('should provide the set of dependencies with versions', () => {
    dependencies.activate();

    return testUtils.retry(() => {
      // Mocha is the main module when running the tests. Without the check for `appInstalledIntoNodeModules` in
      // core/src/util/applicationUnderMonitoring, dependencies would be evaluated as the content of the node_modules
      // directory relative to the main module. But with this check in place, we end up evaluating the dependencies of
      // packages/shared-metrics/node_modules.
      expect(dependencies.currentPayload['event-loop-lag']).to.equal('1.4.0');
      expect(dependencies.currentPayload.semver).to.equal('5.7.1');
      expect(dependencies.currentPayload.mocha).to.equal('6.2.3');
    });
  });
});
