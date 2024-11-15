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
      command: ''
    }
  }
};
let config = {
  tracing: {
    ignoreEndpoints: {
      redis: ['GET', 'SET']
    }
  }
};

describe('filterSpan', () => {
  it('should return null when the span should be ignored', () => {
    span.data.redis.command = 'GET';
    expect(filterSpan(span, config)).equal(null);
  });

  it('should return the span when it should not be ignored', () => {
    span.data.redis.command = 'DEL';
    expect(filterSpan(span, config)).equal(span);
  });

  it('should return the span when command is not in the ignore list', () => {
    span.data.redis.command = 'HGET';
    expect(filterSpan(span, config)).equal(span);
  });

  it('should return the span when span.n does not match any endpoint in config', () => {
    const otherSpan = {
      n: 'node.http.client',
      data: {
        http: {
          command: 'GET'
        }
      }
    };
    expect(filterSpan(otherSpan)).equal(otherSpan);
  });
  it('should return span when no ignoreconfiguration', () => {
    config = {
      tracing: {}
    };
    span.data.redis.command = 'GET';
    expect(filterSpan(span, config)).equal(span);
  });
});
