'use strict';

const proxyquire = require('proxyquire');
const expect = require('chai').expect;
const sinon = require('sinon');

const originalUptime = process.uptime;

describe('metrics.startTime', () => {
  let clock;

  beforeEach(() => {
    clock = sinon.useFakeTimers();
    process.uptime = sinon.stub();
  });

  afterEach(() => {
    process.uptime = originalUptime;
    clock.restore();
  });

  it('should report start time', () => {
    process.uptime.returns(3); // seconds
    clock.tick(100000);
    // proxyquire to reset module state
    const startTime = proxyquire('../../src/metrics/startTime', {});
    expect(startTime.currentPayload).to.equal(97000);
  });
});
