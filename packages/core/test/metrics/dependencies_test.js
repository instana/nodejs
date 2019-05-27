/* eslint-env mocha */

'use strict';

const expect = require('chai').expect;

const utils = require('../utils');
const dependencies = require('../../src/metrics/dependencies');

describe('metrics.dependencies', () => {
  it('should export a dependencies payload prefix', () => {
    expect(dependencies.payloadPrefix).to.equal('dependencies');
  });

  it('should provide the set of depencies with versions', () => {
    dependencies.activate();

    return utils.retry(() => {
      // Testing against Mocha dependencies as mocha is the main module when running the tests and dependencies are
      // evaluated as the content of the node_modules directory relative to the main module.
      expect(dependencies.currentPayload.debug).to.equal('3.1.0');
      expect(dependencies.currentPayload['supports-color']).to.equal('5.4.0');
    });
  });
});
