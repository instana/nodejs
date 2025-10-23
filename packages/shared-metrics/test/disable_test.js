/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const expect = require('chai').expect;
const metrics = require('../src/index');
const disable = require('../src/util/disable');
const testUtils = require('../../core/test/test_util');

describe('metrics.disable', () => {
  beforeEach(() => {
    disable.init({ metrics: { enabled: true } });
  });

  it('allMetrics returns full array when metrics enabled', () => {
    const config = { metrics: { enabled: true }, logger: testUtils.createFakeLogger() };
    metrics.init(config);

    const activeMetrics = metrics.allMetrics;
    expect(activeMetrics).to.be.an('array');
    expect(activeMetrics.length).to.be.greaterThan(0);

    expect(activeMetrics).to.include(require('../src/activeHandles'));
    expect(activeMetrics).to.include(require('../src/gc'));
  });

  it('allMetrics returns empty array when metrics disabled', () => {
    const config = { metrics: { enabled: false } };

    metrics.init(config);

    const activeMetrics = metrics.allMetrics;
    expect(activeMetrics).to.be.an('array');
    expect(activeMetrics).to.have.lengthOf(0);
  });
});
