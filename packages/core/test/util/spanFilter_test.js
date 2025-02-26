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

  describe('advanced filtering with mixed config', () => {
    beforeEach(() => {
      ignoreEndpoints = {
        redis: ['type', 'get'],
        kafka_placeholder: ['consume', 'send', { methods: ['*'], endpoints: ['topic1', 'topic2'] }]
      };
    });

    it('returns null when a Redis span matching an advanced ignore config having other services', () => {
      span.n = 'redis';
      span.data = {
        redis: {
          operation: 'type'
        }
      };
      expect(applyFilter({ span, ignoreEndpoints })).to.equal(null);
    });

    it('returns null when both method and endpoint match', () => {
      ignoreEndpoints = {
        kafka_placeholder: [{ methods: ['send', 'consume'], endpoints: ['topic3'] }]
      };
      span.n = 'kafka_placeholder';
      span.data = {
        kafka_placeholder: {
          operation: 'send',
          endpoints: ['topic3']
        }
      };
      expect(applyFilter({ span, ignoreEndpoints })).to.equal(null);
    });

    it('returns null when "*" is provided in the  method config', () => {
      ignoreEndpoints = {
        kafka_placeholder: [{ methods: ['*'], endpoints: ['topic1', 'topic2'] }]
      };
      span.n = 'kafka_placeholder';
      span.data = {
        kafka_placeholder: {
          operation: 'consume',
          endpoints: 'topic1'
        }
      };
      expect(applyFilter({ span, ignoreEndpoints })).to.equal(null);
    });

    it('returns null when  "*" is provided in the endpoint config', () => {
      ignoreEndpoints = {
        kafka_placeholder: [{ methods: ['consume'], endpoints: ['*'] }]
      };
      span.n = 'kafka_placeholder';
      span.data = {
        kafka_placeholder: {
          operation: 'consume',
          endpoints: 'topic1'
        }
      };
      expect(applyFilter({ span, ignoreEndpoints })).to.equal(null);
    });
    it('returns null when "*" is provided in the  method and endpoint config', () => {
      ignoreEndpoints = {
        kafka_placeholder: [{ methods: ['*'], endpoints: ['*'] }]
      };
      span.n = 'kafka_placeholder';
      span.data = {
        kafka_placeholder: {
          operation: 'consume',
          endpoints: 'topic1'
        }
      };
      expect(applyFilter({ span, ignoreEndpoints })).to.equal(null);
    });

    it('returns null for a span when a simple string config is applied', () => {
      ignoreEndpoints = {
        kafka_placeholder: 'consume'
      };
      span.n = 'kafka_placeholder';
      span.data = {
        kafka_placeholder: {
          operation: 'consume',
          endpoints: 'topic3'
        }
      };
      expect(applyFilter({ span, ignoreEndpoints })).to.equal(null);
    });

    it('returns the original span when the method config does not match', () => {
      ignoreEndpoints = {
        kafka_placeholder: [{ methods: ['send'], endpoints: ['topic3'] }]
      };
      span.n = 'kafka_placeholder';
      span.data = {
        kafka_placeholder: {
          operation: 'consume',
          endpoints: 'topic3'
        }
      };
      expect(applyFilter({ span, ignoreEndpoints })).to.equal(span);
    });

    it('returns the original span when the endpoint config does not match', () => {
      ignoreEndpoints = {
        kafka_placeholder: [{ methods: ['consume'], endpoints: ['topic1'] }]
      };
      span.n = 'kafka_placeholder';
      span.data = {
        kafka_placeholder: {
          operation: 'consume',
          endpoints: 'topic2'
        }
      };
      expect(applyFilter({ span, ignoreEndpoints })).to.equal(span);
    });

    it('returns the original span when the configurations are empty', () => {
      ignoreEndpoints = {
        kafka_placeholder: [{ methods: [], endpoints: [] }]
      };
      span.n = 'kafka_placeholder';
      span.data = {
        kafka_placeholder: {
          operation: 'consume',
          endpoints: 'topic2'
        }
      };
      expect(applyFilter({ span, ignoreEndpoints })).to.equal(span);
    });

    it('returns the original span when the configurations does not specify any filtering criteria', () => {
      ignoreEndpoints = {
        kafka_placeholder: [{}]
      };
      span.n = 'kafka_placeholder';
      span.data = {
        kafka_placeholder: {
          operation: 'consume',
          endpoints: 'topic2'
        }
      };
      expect(applyFilter({ span, ignoreEndpoints })).to.equal(span);
    });
  });
});
