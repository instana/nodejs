/* eslint-env mocha */

'use strict';

var expect = require('chai').expect;

var dependencies = require('./dependencies');

describe('metrics.dependencies', function() {
  afterEach(function() {
    dependencies.deactivate();
  });

  it('should export a dependencies payload prefix', function() {
    expect(dependencies.payloadPrefix).to.equal('dependencies');
  });

  it('should provide the set of depencies with versions', function(done) {
    dependencies.activate();

    setTimeout(function() {
      // testing against Mocha dependencies
      expect(dependencies.currentPayload.mkdirp).to.equal('0.5.0');
      expect(dependencies.currentPayload.glob).to.equal('3.2.3');
      done();
    }, 500);
  });
});
