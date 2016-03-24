/* eslint-env mocha */

'use strict';

var fs = require('fs');
var expect = require('chai').expect;

var activeRequests = require('./activeRequests');

describe('metrics.activeRequests', function() {
  beforeEach(function() {
    activeRequests.activate();
  });

  afterEach(function() {
    activeRequests.deactivate();
  });

  it('should export request count', function() {
    expect(activeRequests.currentPayload).to.equal(process._getActiveRequests().length);
  });

  it('should correlate with request count', function() {
    var expectedRequests = 12;
    for (var i = 0; i < expectedRequests; i++) {
      fs.open(__filename, 'r', function() { });
    }
    expect(activeRequests.currentPayload).to.equal(expectedRequests);
  });
});
