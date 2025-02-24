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
const span1 = {
  t: '1234567803',
  s: '1234567892',
  p: '1234567891',
  n: 'kafka',
  k: 2,
  data: {
    kafka: {
      operation: ''
    }
  }
};
let ignoreEndpoints = {
  redis: ['GET', 'TYPE'],
  dynamodb: ['QUERY']
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
    span.data.redis.operation = 'GET';
    expect(applyFilter({ span, ignoreEndpoints: {} })).equal(span);
  });
  it('should return null when the dynamodb span operation is in the ignore list', () => {
    span.n = 'dynamodb';
    span.data = {
      dynamodb: {
        operation: 'Query'
      }
    };
    expect(applyFilter({ span, ignoreEndpoints })).equal(null);
  });

  it('should return the dynamodb span when the operation is not in the ignore list', () => {
    span.data.dynamodb.operation = 'PutItem';
    expect(applyFilter({ span, ignoreEndpoints })).equal(span);
  });
  describe('applyFilter Advanced Filtering', () => {
    it.skip('should return null for a Redis span matching the string rule', () => {
      ignoreEndpoints = {
        redis: ['type', 'get'],
        kafka: [
          'consume',
          'publish',
          { method: ['*'], endpoints: ['topic1', 'topic2'] },
          { method: ['publish', 'consume'], endpoints: ['topic3'] }
        ]
      };
      span.data = {
        redis: {
          operation: 'type'
        }
      };
      expect(applyFilter({ span, ignoreEndpoints })).to.equal(null);
    });
    it('should return null for a Kafka span with matching operation and endpoint', () => {
      ignoreEndpoints = {
        kafka: [{ method: ['publish', 'consume'], endpoints: ['topic3'] }]
      };
      span1.data = {
        kafka: {
          operation: 'publish',
          endpoints: ['topic3']
        }
      };
      expect(applyFilter({ span: span1, ignoreEndpoints })).to.equal(null);
    });

    it('should return null for a Kafka span using wildcard method filtering', () => {
      ignoreEndpoints = {
        redis: ['type', 'get'],
        kafka: [{ method: ['*'], endpoints: ['topic1', 'topic2'] }]
      };
      span1.data = {
        kafka: {
          operation: 'consume',
          endpoints: 'topic1'
        }
      };
      expect(applyFilter({ span: span1, ignoreEndpoints })).to.equal(null);
    });

    it('should return null for a Kafka span matching a string rule in a mixed configuration', () => {
      ignoreEndpoints = {
        redis: ['type', 'get'],
        kafka: ['consume', 'publish', { method: ['publish'], endpoints: ['topic3'] }]
      };
      span1.data = {
        kafka: {
          operation: 'consume',
          endpoints: 'topic3'
        }
      };
      expect(applyFilter({ span: span1, ignoreEndpoints })).to.equal(null);
    });
  });
});
