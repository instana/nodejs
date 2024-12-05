/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const expect = require('chai').expect;
const { applyFilter } = require('../../src/util/spanFilter');

const span = {
  t: '1234567803',
  s: '1234567892',
  p: '1234567891',
  n: 'redis',
  k: 2,
  data: {
    redis: {
      operation: ''
    }
  }
};
let ignoreEndpoints = {
  redis: ['GET', 'TYPE']
};

describe('util.spanFilter', () => {
  it('should return null when the span should be ignored', () => {
    span.data.redis.operation = 'GET';
    expect(applyFilter({ span, ignoreEndpoints })).equal(null);
  });

  it('should return the span when command is not in the ignore list', () => {
    span.data.redis.operation = 'HGET';
    expect(applyFilter({ span, ignoreEndpoints })).equal(span);
  });

  it('should return the span when span.n does not match any endpoint in config', () => {
    span.n = 'node.http.client';
    expect(applyFilter({ span, ignoreEndpoints })).equal(span);
  });
  it('should return span when no ignoreconfiguration', () => {
    ignoreEndpoints = {};
    span.data.redis.operation = 'GET';
    expect(applyFilter({ span, ignoreEndpoints })).equal(span);
  });
});
