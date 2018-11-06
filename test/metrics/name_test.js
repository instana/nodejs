/* eslint-env mocha */

'use strict';

var expect = require('chai').expect;

var utils = require('../utils');
var name = require('../../src/metrics/name');

describe('metrics.name', function() {
  afterEach(function() {
    name.deactivate();
  });

  it('should export a name payload prefix', function() {
    expect(name.payloadPrefix).to.equal('name');
  });

  it('should provide the main module name', function() {
    name.activate();

    return utils.retry(function() {
      // Mocha is used to execute the tests via the mocha executable.
      // As such mocha is the main module.
      expect(name.currentPayload).to.equal('mocha');
    });
  });
});
