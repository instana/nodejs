'use strict';

const expect = require('chai').expect;

const testUtils = require('../../../core/test/test_util');
const dependencies = require('../../src/metrics/dependencies');

describe('metrics.dependencies', () => {
  it('should export a dependencies payload prefix', () => {
    expect(dependencies.payloadPrefix).to.equal('dependencies');
  });

  it('should provide the set of depencies with versions', () => {
    dependencies.activate();

    return testUtils.retry(() => {
      // Testing against Mocha dependencies as mocha is the main module when running the tests and dependencies are
      // evaluated as the content of the node_modules directory relative to the main module.
      expect(dependencies.currentPayload.glob).to.equal('7.1.3');
      expect(dependencies.currentPayload.ms).to.equal('2.1.1');
      expect(dependencies.currentPayload['supports-color']).to.equal('6.0.0');
    });
  });
});
