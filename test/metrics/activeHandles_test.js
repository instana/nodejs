/* eslint-env mocha */

'use strict';

var expect = require('chai').expect;
var semver = require('semver');

var activeHandles = require('../../src/metrics/activeHandles');

describe('metrics.activeHandles', function() {
  beforeEach(function() {
    activeHandles.activate();
  });

  afterEach(function() {
    activeHandles.deactivate();
  });

  it('should export active handle count', function() {
    expect(activeHandles.currentPayload).to.equal(process._getActiveHandles().length);
  });

  it('should update handle count', function() {
    if (semver.satisfies(process.versions.node, '>=11')) {
      // skip test beginning with Node.js 11, I suspect commit https://github.com/nodejs/node/commit/ccc3bb73db
      // (PR https://github.com/nodejs/node/pull/24264) to have broken this metric.
      return;
    }

    var previousCount = activeHandles.currentPayload;
    var timeoutHandle = setTimeout(function() {}, 100);
    expect(activeHandles.currentPayload).to.equal(previousCount + 1);
    clearTimeout(timeoutHandle);
  });
});
