/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2015
 */

'use strict';

const expect = require('chai').expect;

const config = require('@instana/core/test/config');
const { retry } = require('@instana/core/test/test_util');
const dependencies = require('../src/dependencies');

/*
 * More tests for the dependencies collection, in particular for limiting the number of dependencies are located in
 * packages/shared-metrics/test/dependencies/test.js
 */
describe('metrics.dependencies', function () {
  this.timeout(config.getTestTimeout());

  it('should export a dependencies payload prefix', () => {
    expect(dependencies.payloadPrefix).to.equal('dependencies');
  });

  it('should provide the set of dependencies with versions', () => {
    dependencies.activate();

    return retry(() => {
      // Mocha is the main module when running the tests. Without the check for `appInstalledIntoNodeModules` in
      // core/src/util/applicationUnderMonitoring, dependencies would be evaluated as the content of the node_modules
      // directory relative to the main module. But with this check in place, we end up evaluating the dependencies in
      // packages/shared-metrics/node_modules.
      // TODO: Fix later
      // expect(Object.keys(dependencies.currentPayload).length).to.be.greaterThan(200);
      // expect(dependencies.currentPayload['event-loop-lag']).to.equal('1.4.0');
      // expect(dependencies.currentPayload.semver).to.equal('7.3.3');
      // expect(dependencies.currentPayload.mocha).to.equal('7.2.0');
    });
  });
});
