/* eslint-env mocha */

'use strict';

var expect = require('chai').expect;

var memory = require('./memory');

describe('metrics.memory', function() {
  afterEach(function() {
    memory.deactivate();
  });

  it('should export a memory payload prefix', function() {
    expect(memory.payloadPrefix).to.equal('memory');
  });

  it('should provide memory information', function() {
    memory.activate();
    var p = memory.currentPayload;
    expect(p.rss).to.be.a('number');
    expect(p.heapTotal).to.be.a('number');
    expect(p.heapUsed).to.be.a('number');
  });

  // Test is too fragile (especially for CI environments) and should only be used locally
  // to verify the behavior from time to time.
  it.skip('should update memory information after 1s', function(done) {
    memory.activate();
    var previousPayload = memory.currentPayload;

    // generate some garbage so that memory information changes
    var garbage = [];
    for (var i = 0; i < 100; i++) {
      garbage.push(new Date());
    }

    setTimeout(function() {
      var newPayload = memory.currentPayload;
      expect(newPayload.heapUsed).to.be.gt(previousPayload.heapUsed);
      done();
    }, 1100);
  });
});
