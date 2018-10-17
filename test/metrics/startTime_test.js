/* eslint-env mocha */

'use strict';

var proxyquire = require('proxyquire');
var expect = require('chai').expect;
var sinon = require('sinon');

var originalUptime = process.uptime;

describe('metrics.startTime', function() {
  var clock;

  beforeEach(function() {
    clock = sinon.useFakeTimers();
    process.uptime = sinon.stub();
  });

  afterEach(function() {
    process.uptime = originalUptime;
    clock.restore();
  });

  it('should report start time', function() {
    process.uptime.returns(3); // seconds
    clock.tick(100000);
    // proxyquire to reset module state
    var startTime = proxyquire('../../src/metrics/startTime', {});
    expect(startTime.currentPayload).to.equal(97000);
  });
});
