/* eslint-env mocha */

'use strict';

var expect = require('chai').expect;
var fs = require('fs');

var activeRequests = require('../../src/metrics/activeRequests');

describe('metrics.activeRequests', function() {
  it('should export active requests count', function() {
    expect(activeRequests.currentPayload).to.equal(process._getActiveRequests().length);
  });

  it('should update requests count for a fs.open', function() {
    var activeRequestBefore = activeRequests.currentPayload;
    for (var i = 0; i < 13; i++) {
      fs.open(__filename, 'r', function() {});
    }
    expect(activeRequests.currentPayload).to.equal(activeRequestBefore + 13);
  });
});
