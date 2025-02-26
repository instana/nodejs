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
    it('should return null for `Redis` when advanced configuration is applied with other services', () => {
      span.n = 'redis';
      ignoreEndpoints = {
        redis: ['type', 'get'],
        kafka: [
          'consume',
          'publish',
          { methods: ['*'], endpoints: ['topic1', 'topic2'] },
          { methods: ['publish', 'consume'], endpoints: ['topic3'] }
        ]
      };
      span.data = {
        redis: {
          operation: 'type'
        }
      };
      expect(applyFilter({ span, ignoreEndpoints })).to.equal(null);
    });

    it('should return null for Kafka span with matching operation and endpoint', () => {
      ignoreEndpoints = {
        kafka: [{ methods: ['publish', 'consume'], endpoints: ['topic3'] }]
      };
      span.n = 'kafka';
      span.data = {
        kafka: {
          operation: 'publish',
          endpoints: ['topic3']
        }
      };
      expect(applyFilter({ span: span, ignoreEndpoints })).to.equal(null);
    });

    it('should return null for a Kafka span using wildcard methods filtering', () => {
      ignoreEndpoints = {
        kafka: [{ methods: ['*'], endpoints: ['topic1', 'topic2'] }]
      };
      span.n = 'kafka';
      span.data = {
        kafka: {
          operation: 'consume',
          endpoints: 'topic1'
        }
      };
      expect(applyFilter({ span: span, ignoreEndpoints })).to.equal(null);
    });

     it('should return null for a Kafka span using wildcard endpoint filtering', () => {
       ignoreEndpoints = {
         kafka: [{ methods: ['consume'], endpoints: ['*'] }]
       };
       span.n = 'kafka';
       span.data = {
         kafka: {
           operation: 'consume',
           endpoints: 'topic1'
         }
       };
       expect(applyFilter({ span: span, ignoreEndpoints })).to.equal(null);
     });

    it('should return null for a Kafka span matching a string rule in a mixed configuration', () => {
      ignoreEndpoints = {
        kafka: 'consume'
      };
      span.n = 'kafka';

      span.data = {
        kafka: {
          operation: 'consume',
          endpoints: 'topic3'
        }
      };
      expect(applyFilter({ span: span, ignoreEndpoints })).to.equal(null);
    });
  });
});
