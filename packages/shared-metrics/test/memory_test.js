'use strict';

const expect = require('chai').expect;

const testUtils = require('../../core/test/test_util');
const memory = require('../src/memory');

describe('metrics.memory', () => {
  afterEach(() => {
    memory.deactivate();
  });

  it('should export a memory payload prefix', () => {
    expect(memory.payloadPrefix).to.equal('memory');
  });

  it('should provide memory information', () => {
    memory.activate();
    const p = memory.currentPayload;
    expect(p.rss).to.be.a('number');
    expect(p.heapTotal).to.be.a('number');
    expect(p.heapUsed).to.be.a('number');
  });

  // Test is too fragile (especially for CI environments) and should only be used locally
  // to verify the behavior from time to time.
  it.skip('should update memory information after 1s', () => {
    memory.activate();
    const previousPayload = memory.currentPayload;

    // generate some garbage so that memory information changes
    const garbage = [];
    for (let i = 0; i < 100; i++) {
      garbage.push(new Date());
    }

    return testUtils.retry(() => {
      const newPayload = memory.currentPayload;
      expect(newPayload.heapUsed).to.be.gt(previousPayload.heapUsed);
    });
  });
});
