/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const expect = require('chai').expect;
const {
  spanName,
  spanAttributes,
  spanStatus
} = require('../../../../src/otlpExporter/traces/mappers/instanaInstrumentationMappings');
const { STATUS_CODES } = require('../../../../src/otlpExporter/traces/mappers/constants');

describe('otlpExporter/traces/mappers/instanaInstrumentationMappings', () => {
  describe('spanName', () => {
    it('should generate HTTP span name with method and path', () => {
      const span = {
        n: 'node.http.server',
        data: {
          http: {
            method: 'GET',
            path: '/api/users'
          }
        }
      };

      const result = spanName(span);
      expect(result).to.equal('GET /api/users');
    });

    it('should generate HTTP span name with operation and path_tpl', () => {
      const span = {
        n: 'node.http.server',
        data: {
          http: {
            operation: 'POST',
            path_tpl: '/api/users/:id'
          }
        }
      };

      const result = spanName(span);
      expect(result).to.equal('POST /api/users/:id');
    });

    it('should generate Kafka span name', () => {
      const span = {
        n: 'kafka',
        data: {
          kafka: {
            operation: 'publish',
            service: 'my-topic'
          }
        }
      };

      const result = spanName(span);
      expect(result).to.equal('publish my-topic');
    });

    it('should generate RabbitMQ span name', () => {
      const span = {
        n: 'rabbitmq',
        data: {
          rabbitmq: {
            sort: 'publish',
            exchange: 'my-exchange'
          }
        }
      };

      const result = spanName(span);
      expect(result).to.equal('publish my-exchange');
    });

    it('should generate PostgreSQL span name from statement', () => {
      const span = {
        n: 'postgres',
        data: {
          pg: {
            stmt: 'SELECT * FROM users WHERE id = $1'
          }
        }
      };

      const result = spanName(span);
      expect(result).to.equal('SELECT');
    });

    it('should generate MySQL span name from statement', () => {
      const span = {
        n: 'mysql',
        data: {
          mysql: {
            stmt: 'INSERT INTO users (name, email) VALUES (?, ?)'
          }
        }
      };

      const result = spanName(span);
      expect(result).to.equal('INSERT');
    });

    it('should generate MongoDB span name', () => {
      const span = {
        n: 'mongo',
        data: {
          mongo: {
            command: 'find'
          }
        }
      };

      const result = spanName(span);
      expect(result).to.equal('mongo.find');
    });

    it('should generate Redis span name', () => {
      const span = {
        n: 'redis',
        data: {
          redis: {
            operation: 'get'
          }
        }
      };

      const result = spanName(span);
      expect(result).to.equal('redis.get');
    });

    it('should generate DynamoDB span name', () => {
      const span = {
        n: 'dynamodb',
        data: {
          dynamodb: {
            operation: 'GetItem'
          }
        }
      };

      const result = spanName(span);
      expect(result).to.equal('dynamodb.GetItem');
    });

    it('should generate S3 span name', () => {
      const span = {
        n: 's3',
        data: {
          s3: {
            op: 'putObject'
          }
        }
      };

      const result = spanName(span);
      expect(result).to.equal('s3.putObject');
    });

    it('should generate Lambda invoke span name', () => {
      const span = {
        n: 'aws.lambda.invoke',
        data: {
          'aws.lambda.invoke': {
            function: 'my-function'
          }
        }
      };

      const result = spanName(span);
      expect(result).to.equal('Invoke my-function');
    });

    it('should generate GraphQL span name with operation name', () => {
      const span = {
        n: 'graphql',
        data: {
          graphql: {
            operationType: 'query',
            operationName: 'GetUser'
          }
        }
      };

      const result = spanName(span);
      expect(result).to.equal('query GetUser');
    });

    it('should generate GraphQL span name without operation name', () => {
      const span = {
        n: 'graphql',
        data: {
          graphql: {
            operationType: 'mutation'
          }
        }
      };

      const result = spanName(span);
      expect(result).to.equal('mutation');
    });

    it('should fallback to span.n when no handler exists', () => {
      const span = {
        n: 'custom.span',
        data: {
          custom: {}
        }
      };

      const result = spanName(span);
      expect(result).to.equal('custom.span');
    });

    it('should return "unknown" when span has no name or type', () => {
      const span = {
        data: {}
      };

      const result = spanName(span);
      expect(result).to.equal('unknown');
    });
  });

  describe('spanAttributes', () => {
    it('should extract HTTP attributes', () => {
      const span = {
        data: {
          http: {
            method: 'POST',
            path: '/api/users',
            status: 201,
            host: 'example.com:8080'
          }
        }
      };

      const result = spanAttributes(span);
      console.log(result);
      expect(result).to.be.an('array');
      expect(result).to.deep.include({
        key: 'http.method',
        value: { stringValue: 'POST' }
      });
      expect(result).to.deep.include({
        key: 'http.target',
        value: { stringValue: '/api/users' }
      });
      expect(result).to.deep.include({
        key: 'http.status_code',
        value: { intValue: 201 }
      });
    });
  });

  describe('spanStatus', () => {
    it('should return UNSET status when span has no error', () => {
      const span = {
        n: 'node.http.server',
        data: {
          http: {
            method: 'GET',
            path: '/api/users',
            status: 200
          }
        }
      };

      const result = spanStatus(span);

      expect(result).to.deep.equal({
        code: STATUS_CODES.UNSET
      });
    });

    it('should return ERROR status when span.ec is set', () => {
      const span = {
        n: 'node.http.server',
        ec: 1,
        data: {
          http: {
            method: 'GET',
            path: '/api/users',
            status: 500,
            error: 'Internal Server Error'
          }
        }
      };

      const result = spanStatus(span);

      expect(result).to.deep.equal({
        code: STATUS_CODES.ERROR,
        message: 'Internal Server Error'
      });
    });

    it('should return ERROR status for HTTP client 4xx responses', () => {
      const span = {
        n: 'node.http.client',
        data: {
          http: {
            method: 'GET',
            path: '/api/users',
            status: 404
          }
        }
      };

      const result = spanStatus(span);

      expect(result).to.deep.equal({
        code: STATUS_CODES.ERROR,
        message: 'http failed'
      });
    });

    it('should return ERROR status for HTTP client 400 response', () => {
      const span = {
        n: 'node.http.client',
        data: {
          http: {
            method: 'POST',
            path: '/api/users',
            status: 400
          }
        }
      };

      const result = spanStatus(span);

      expect(result).to.deep.equal({
        code: STATUS_CODES.ERROR,
        message: 'http failed'
      });
    });

    it('should return ERROR status for HTTP client 499 response', () => {
      const span = {
        n: 'node.http.client',
        data: {
          http: {
            method: 'GET',
            path: '/api/users',
            status: 499
          }
        }
      };

      const result = spanStatus(span);

      expect(result).to.deep.equal({
        code: STATUS_CODES.ERROR,
        message: 'http failed'
      });
    });

    it('should NOT return ERROR status for HTTP client 5xx responses without ec', () => {
      const span = {
        n: 'node.http.client',
        data: {
          http: {
            method: 'GET',
            path: '/api/users',
            status: 500
          }
        }
      };

      const result = spanStatus(span);

      // 5xx without ec should be UNSET (not in 4xx range)
      expect(result).to.deep.equal({
        code: STATUS_CODES.UNSET
      });
    });

    it('should NOT return ERROR status for HTTP client 3xx responses', () => {
      const span = {
        n: 'node.http.client',
        data: {
          http: {
            method: 'GET',
            path: '/api/users',
            status: 301
          }
        }
      };

      const result = spanStatus(span);

      expect(result).to.deep.equal({
        code: STATUS_CODES.UNSET
      });
    });

    it('should use error message from span data when available', () => {
      const span = {
        n: 'postgres',
        ec: 1,
        data: {
          pg: {
            stmt: 'SELECT * FROM users',
            error: 'Connection refused'
          }
        }
      };

      const result = spanStatus(span);

      expect(result).to.deep.equal({
        code: STATUS_CODES.ERROR,
        message: 'Connection refused'
      });
    });

    it('should fallback to span type in error message', () => {
      const span = {
        n: 'redis',
        ec: 1,
        data: {
          redis: {
            operation: 'get'
          }
        }
      };

      const result = spanStatus(span);

      expect(result).to.deep.equal({
        code: STATUS_CODES.ERROR,
        message: 'redis failed'
      });
    });

    it('should fallback to span name in error message when no type', () => {
      const span = {
        n: 'custom.operation',
        ec: 1,
        data: {}
      };

      const result = spanStatus(span);

      expect(result).to.deep.equal({
        code: STATUS_CODES.ERROR,
        message: 'custom.operation failed'
      });
    });

    it('should fallback to "operation" in error message when no type or name', () => {
      const span = {
        ec: 1,
        data: {}
      };

      const result = spanStatus(span);

      expect(result).to.deep.equal({
        code: STATUS_CODES.ERROR,
        message: 'operation failed'
      });
    });
  });
});
