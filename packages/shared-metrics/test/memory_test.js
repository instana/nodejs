/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2015
 */

'use strict';

const expect = require('chai').expect;

const testUtils = require('@_local/core/test/test_util');
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
    /** @type {*} */
    const p = memory.currentPayload;
    expect(p.rss).to.be.a('number');
    expect(p.heapTotal).to.be.a('number');
    expect(p.heapUsed).to.be.a('number');
  });

  // Test is too fragile (especially for CI environments) and should only be used locally
  // to verify the behavior from time to time.
  it.skip('should update memory information after 1 s', () => {
    memory.activate();
    /** @type {*} */
    const previousPayload = memory.currentPayload;

    // generate some garbage so that memory information changes
    const garbage = [];
    for (let i = 0; i < 100; i++) {
      garbage.push(new Date());
    }

    return testUtils.retry(() => {
      /** @type {*} */
      const newPayload = memory.currentPayload;
      expect(newPayload.heapUsed).to.be.gt(previousPayload.heapUsed);
    });
  });
});
