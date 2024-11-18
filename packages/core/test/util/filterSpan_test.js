/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const expect = require('chai').expect;
const { filterSpan } = require('../../src/util/filterSpan');

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

describe('util.filterSpan', () => {
  it('should return null when the span should be ignored', () => {
    span.data.redis.operation = 'GET';
    expect(filterSpan({ span, ignoreEndpoints })).equal(null);
  });

  it('should return the span when command is not in the ignore list', () => {
    span.data.redis.operation = 'HGET';
    expect(filterSpan({ span, ignoreEndpoints })).equal(span);
  });

  it('should return the span when span.n does not match any endpoint in config', () => {
    span.n = 'node.http.client';
    expect(filterSpan({ span, ignoreEndpoints })).equal(span);
  });
  it('should return span when no ignoreconfiguration', () => {
    ignoreEndpoints = {};
    span.data.redis.operation = 'GET';
    expect(filterSpan({ span, ignoreEndpoints })).equal(span);
  });
});
