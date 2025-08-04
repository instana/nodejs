/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const expect = require('chai').expect;
const { applyFilter, shouldIgnore, init } = require('../../src/util/spanFilter');

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

describe('util.spanFilter', () => {
  describe('applyFilter', () => {
    before(() => {
      const config = {
        tracing: {
          ignoreEndpoints: {
            redis: [{ methods: ['GET', 'TYPE'] }],
            dynamodb: [{ methods: ['QUERY'] }],
            kafka: [{ methods: ['send', 'consume'], endpoints: ['topic3'] }]
          }
        }
      };
      init(config);
    });

    it('should return null when the span should be ignored', () => {
      span.data.redis.operation = 'GET';
      expect(applyFilter(span)).to.equal(null);
    });

    it('should return the span when command is not in the ignore list', () => {
      span.data.redis.operation = 'HGET';
      expect(applyFilter(span)).to.equal(span);
    });

    it('should return the span when span.n does not match any endpoint in config', () => {
      span.n = 'node.http.client';
      expect(applyFilter(span)).to.equal(span);
    });

    it('should return span when no ignore configuration is provided', () => {
      span.data.redis.operation = 'GET';
      expect(applyFilter(span)).to.equal(span);
    });

    it('should return null when the dynamodb span operation is in the ignore list', () => {
      span.n = 'dynamodb';
      span.data = {
        dynamodb: {
          operation: 'Query'
        }
      };
      expect(applyFilter(span)).to.equal(null);
    });

    it('should return the dynamodb span when the operation is not in the ignore list', () => {
      span.data.dynamodb.operation = 'PutItem';
      expect(applyFilter(span)).to.equal(span);
    });
    it('return null when an advanced config for multiple services is applied and the Redis config matches', () => {
      span.n = 'redis';
      span.data = {
        redis: {
          operation: 'type'
        }
      };
      expect(applyFilter(span)).to.equal(null);
    });
  });
  describe('shouldIgnore', () => {
    let ignoreEndpoints = {
      redis: [{ methods: ['GET', 'TYPE'] }],
      dynamodb: [{ methods: ['QUERY'] }]
    };
    it('should return true when the span should be ignored', () => {
      span.data.redis.operation = 'GET';
      expect(shouldIgnore(span, ignoreEndpoints)).equal(true);
    });

    it('should return false when command is not in the ignore list', () => {
      span.data.redis.operation = 'HGET';
      expect(shouldIgnore(span, ignoreEndpoints)).equal(false);
    });

    it('should return false when span.n does not match any endpoint in config', () => {
      span.n = 'node.http.client';
      expect(shouldIgnore(span, ignoreEndpoints)).equal(false);
    });
    it('should return false when no ignoreconfiguration', () => {
      span.data.redis.operation = 'GET';
      expect(shouldIgnore({ span, ignoreEndpoints: {} })).equal(false);
    });
    it('should return true when the dynamodb span operation is in the ignore list', () => {
      span.n = 'dynamodb';
      span.data = {
        dynamodb: {
          operation: 'Query'
        }
      };
      expect(shouldIgnore(span, ignoreEndpoints)).equal(true);
    });

    it('should return false when the operation is not in the ignore list', () => {
      span.data.dynamodb.operation = 'PutItem';
      expect(shouldIgnore(span, ignoreEndpoints)).equal(false);
    });

    describe('util.spanFilter: advanced filtering', () => {
      it('return true when an advanced config for multiple services is applied and the Redis config matches', () => {
        ignoreEndpoints = {
          redis: [{ methods: ['type', 'get'] }],
          kafka: [{ methods: ['*'], endpoints: ['topic1', 'topic2'] }]
        };
        span.n = 'redis';
        span.data = {
          redis: {
            operation: 'type'
          }
        };
        expect(shouldIgnore(span, ignoreEndpoints)).to.equal(true);
      });

      it('return true when both method and endpoint criteria match', () => {
        ignoreEndpoints = {
          kafka: [{ methods: ['send', 'consume'], endpoints: ['topic3'] }]
        };
        span.n = 'kafka';
        span.data = {
          kafka: {
            operation: 'send',
            endpoints: ['topic3']
          }
        };
        expect(shouldIgnore(span, ignoreEndpoints)).to.equal(true);
      });

      it('return true when "*" is specified for methods config', () => {
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
        expect(shouldIgnore(span, ignoreEndpoints)).to.equal(true);
      });

      it('return true when  "*" is specified for endpoints config', () => {
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
        expect(shouldIgnore(span, ignoreEndpoints)).to.equal(true);
      });

      it('return true when "*" are used for both methods and endpoints config', () => {
        ignoreEndpoints = {
          kafka: [{ methods: ['*'], endpoints: ['*'] }]
        };
        span.n = 'kafka';
        span.data = {
          kafka: {
            operation: 'consume',
            endpoints: 'topic1'
          }
        };
        expect(shouldIgnore(span, ignoreEndpoints)).to.equal(true);
      });

      // eslint-disable-next-line max-len
      it('return false when config with multiple endpoints and it does not matches all endpoints(array format) in span', () => {
        ignoreEndpoints = {
          kafka: [{ methods: ['consume'], endpoints: ['topic1', 'topic2'] }]
        };
        span.n = 'kafka';
        span.data = {
          kafka: {
            operation: 'consume',
            endpoints: ['topic1', 'topic3']
          }
        };
        expect(shouldIgnore(span, ignoreEndpoints)).to.equal(false);
      });

      it('return true when config with multiple endpoints and matches all endpoints(array) in span', () => {
        ignoreEndpoints = {
          kafka: [{ methods: ['consume'], endpoints: ['topic1', 'topic2'] }]
        };
        span.n = 'kafka';
        span.data = {
          kafka: {
            operation: 'consume',
            endpoints: ['topic1', 'topic2']
          }
        };
        expect(shouldIgnore(span, ignoreEndpoints)).to.equal(true);
      });

      it('returns false when endpoints as an array does not match any of the span endpoints', () => {
        ignoreEndpoints = {
          kafka: [{ methods: ['consume'], endpoints: ['topic1', 'topic2'] }]
        };
        span.n = 'kafka';
        span.data = {
          kafka: {
            operation: 'consume',
            endpoints: ['topic3', 'topic4']
          }
        };
        expect(shouldIgnore(span, ignoreEndpoints)).to.equal(false);
      });

      it('returns false when the method config does not match', () => {
        ignoreEndpoints = {
          kafka: [{ methods: ['send'], endpoints: ['topic3'] }]
        };
        span.n = 'kafka';
        span.data = {
          kafka: {
            operation: 'consume',
            endpoints: 'topic3'
          }
        };
        expect(shouldIgnore(span, ignoreEndpoints)).to.equal(false);
      });

      it('returns false when the endpoint config does not match', () => {
        ignoreEndpoints = {
          kafka: [{ methods: ['consume'], endpoints: ['topic1'] }]
        };
        span.n = 'kafka';
        span.data = {
          kafka: {
            operation: 'consume',
            endpoints: 'topic2'
          }
        };
        expect(shouldIgnore(span, ignoreEndpoints)).to.equal(false);
      });

      it('returns false when empty configuration arrays are provided', () => {
        ignoreEndpoints = {
          kafka: [{ methods: [], endpoints: [] }]
        };
        span.n = 'kafka';
        span.data = {
          kafka: {
            operation: 'consume',
            endpoints: 'topic2'
          }
        };
        expect(shouldIgnore(span, ignoreEndpoints)).to.equal(false);
      });

      it('returns false when the configurations does not specify any filtering criteria', () => {
        ignoreEndpoints = {
          kafka: [{}]
        };
        span.n = 'kafka';
        span.data = {
          kafka: {
            operation: 'consume',
            endpoints: 'topic2'
          }
        };
        expect(shouldIgnore(span, ignoreEndpoints)).to.equal(false);
      });

      it('returns false when the configurations specify unsupported filtering criteria', () => {
        ignoreEndpoints = {
          kafka: [{ operation: ['consume'], topics: ['topic2'] }]
        };
        span.n = 'kafka';
        span.data = {
          kafka: {
            operation: 'consume',
            endpoints: 'topic2'
          }
        };
        expect(shouldIgnore(span, ignoreEndpoints)).to.equal(false);
      });

      it('returns false when the configurations specify unsupported service', () => {
        ignoreEndpoints = {
          amqp: [{ methods: ['consume'], endpoints: ['topic2'] }]
        };
        span.n = 'kafka';
        span.data = {
          kafka: {
            operation: 'consume',
            endpoints: 'topic2'
          }
        };
        expect(shouldIgnore(span, ignoreEndpoints)).to.equal(false);
      });

      it('returns false when the config having endpoints and span having empty endpoints array', () => {
        ignoreEndpoints = {
          kafka: [{ methods: ['consume'], endpoints: ['topic2'] }]
        };
        span.n = 'kafka';
        span.data = {
          kafka: {
            operation: 'consume',
            endpoints: []
          }
        };
        expect(shouldIgnore(span, ignoreEndpoints)).to.equal(false);
      });

      it('returns false when kafka span has mutiple endpoints and not all endpoints configured to be ignored', () => {
        ignoreEndpoints = {
          kafka: [{ methods: ['consume'], endpoints: ['topic2'] }]
        };
        span.n = 'kafka';
        span.data = {
          kafka: {
            operation: 'consume',
            endpoints: 'topic1,topic2'
          }
        };
        expect(shouldIgnore(span, ignoreEndpoints)).to.equal(false);
      });

      it('returns true when kafka span has mutiple endpoints and all endpoints configured to be ignored', () => {
        ignoreEndpoints = {
          kafka: [{ methods: ['consume'], endpoints: ['topic1', 'topic2', 'topic3'] }]
        };
        span.n = 'kafka';
        span.data = {
          kafka: {
            operation: 'consume',
            endpoints: 'topic1,topic2'
          }
        };
        expect(shouldIgnore(span, ignoreEndpoints)).to.equal(true);
      });

      it('returns false when span endpoints do not contain any ignored topics', () => {
        ignoreEndpoints = {
          kafka: [{ methods: ['consume'], endpoints: ['ignore_consume_1'] }]
        };
        span.n = 'kafka';
        span.data = {
          kafka: {
            operation: 'consume',
            endpoints: 'do_not_ignore_consume_1'
          }
        };
        expect(shouldIgnore(span, ignoreEndpoints)).to.equal(false);
      });

      it('returns false when span endpoints contain topics not in the ignored list', () => {
        ignoreEndpoints = {
          kafka: [{ methods: ['consume'], endpoints: ['do_not_ignore_consume_1'] }]
        };
        span.n = 'kafka';
        span.data = {
          kafka: {
            operation: 'consume',
            endpoints: 'ignore_consume_1'
          }
        };
        expect(shouldIgnore(span, ignoreEndpoints)).to.equal(false);
      });

      // eslint-disable-next-line max-len
      it('returns true when multiple configurations are specified, the method matches, and the endpoint is set to *', () => {
        ignoreEndpoints = {
          kafka: [
            { methods: ['consume'], endpoints: ['do_not_ignore_consume_1'] },
            { methods: ['send'], endpoints: ['ignore_consume_1'] },
            { methods: ['*'], endpoints: ['do_not_ignore_consume_1'] },
            { methods: ['consume'], endpoints: ['*'] }
          ]
        };
        span.n = 'kafka';
        span.data = {
          kafka: {
            operation: 'consume',
            endpoints: 'ignore_consume_1'
          }
        };
        expect(shouldIgnore(span, ignoreEndpoints)).to.equal(true);
      });

      it('returns true when span connection matches redis ignored connection list', () => {
        ignoreEndpoints = {
          redis: [{ connections: ['127.0.0.1:6379'] }]
        };
        span.n = 'redis';
        span.data = {
          redis: {
            connection: '127.0.0.1:6379'
          }
        };

        expect(shouldIgnore(span, ignoreEndpoints)).to.equal(true);
      });

      it('returns false when span connection does not match ignored connection list', () => {
        ignoreEndpoints = {
          redis: [{ connections: ['192.168.1.1:6379'] }]
        };
        span.n = 'redis';
        span.data = {
          redis: {
            connection: '127.0.0.1:6379'
          }
        };

        expect(shouldIgnore(span, ignoreEndpoints)).to.equal(false);
      });

      it('returns false when no connections specified in ignore config', () => {
        ignoreEndpoints = {
          redis: [{}]
        };
        span.n = 'redis';
        span.data = {
          redis: {
            connection: '127.0.0.1:6379'
          }
        };

        expect(shouldIgnore(span, ignoreEndpoints)).to.equal(false);
      });

      it('returns false when span type not in ignorable list', () => {
        ignoreEndpoints = {
          redis: [{ connections: ['127.0.0.1:6379'] }]
        };
        span.n = 'http';
        span.data = {
          http: {
            connection: '127.0.0.1:6379'
          }
        };

        expect(shouldIgnore(span, ignoreEndpoints)).to.equal(false);
      });

      it('returns true when span connection and method configured', () => {
        ignoreEndpoints = {
          redis: [{ connections: ['127.0.0.1:6379'], methods: ['GET'] }]
        };
        span.n = 'http';
        span.data = {
          http: {
            connection: '127.0.0.1:6379',
            operation: 'GET'
          }
        };

        expect(shouldIgnore(span, ignoreEndpoints)).to.equal(false);
      });
    });

    it('should return true when span.n is node.http.server and config has http entry with matching method', () => {
      ignoreEndpoints = {
        http: [{ methods: ['GET'] }]
      };
      span.n = 'node.http.server';
      span.data = {
        http: {
          operation: 'GET'
        }
      };
      expect(shouldIgnore(span, ignoreEndpoints)).to.equal(true);
    });

    it('should return false when span.n is node.http.client and config has http entry with matching method', () => {
      ignoreEndpoints = {
        http: [{ methods: ['POST'] }]
      };
      span.n = 'node.http.client';
      span.data = {
        http: {
          operation: 'POST'
        }
      };
      expect(shouldIgnore(span, ignoreEndpoints)).to.equal(false);
    });

    it('should return false when span.n is node.http.client and method does not match', () => {
      ignoreEndpoints = {
        http: [{ methods: ['DELETE'] }]
      };
      span.n = 'node.http.client';
      span.data = {
        http: {
          operation: 'PUT'
        }
      };
      expect(shouldIgnore(span, ignoreEndpoints)).to.equal(false);
    });

    it('should return false when span.n is node.http.server and config has no http entry', () => {
      ignoreEndpoints = {
        redis: [{ methods: ['GET'] }]
      };
      span.n = 'node.http.server';
      span.data = {
        http: {
          operation: 'GET'
        }
      };
      expect(shouldIgnore(span, ignoreEndpoints)).to.equal(false);
    });
  });
});
