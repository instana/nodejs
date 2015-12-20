/* eslint-env mocha */

'use strict';

var expect = require('chai').expect;

var name = require('./name');

describe('metrics.name', function() {
  afterEach(function() {
    name.deactivate();
  });

  it('should export a name payload prefix', function() {
    expect(name.payloadPrefix).to.equal('name');
  });

  it('should provide the main module name', function(done) {
    name.activate();

    setTimeout(function() {
      // Mocha is used to execute the tests via the mocha executable.
      // As such mocha is the main module.
      expect(name.currentPayload).to.equal('mocha');
      done();
    }, 1000);
  });
});
