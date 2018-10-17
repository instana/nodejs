/* eslint-env mocha */

'use strict';

var expect = require('chai').expect;

var activeHandles = require('../../src/metrics/activeHandles');

describe('metrics.activeHandles', function() {
  beforeEach(function() {
    activeHandles.activate();
  });

  afterEach(function() {
    activeHandles.deactivate();
  });

  it('should export handle count', function() {
    expect(activeHandles.currentPayload).to.equal(process._getActiveHandles().length);
  });

  it('should update handle count', function() {
    var previousCount = activeHandles.currentPayload;
    var timeoutHandle = setTimeout(function() {}, 100);
    expect(activeHandles.currentPayload).to.equal(previousCount + 1);
    clearTimeout(timeoutHandle);
  });
});
