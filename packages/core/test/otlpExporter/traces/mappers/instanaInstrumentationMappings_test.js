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
const { OTLP_STATUS_CODES } = require('../../../../src/otlpExporter/traces/mappers/constants');

describe('otlpExporter/traces/mappers/instanaInstrumentationMappings', () => {
  describe('spanName', () => {
    it('should generate HTTP span name with method and path', () => {
      const span = {
        n: 'node.http.server',
        data: {
          http: {
            operation: 'GET',
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

    it('should generate Kafka span name (kafkajs/rdkafka — operation + endpoints)', () => {
      const span = {
        n: 'kafka',
        data: {
          kafka: {
            operation: 'send',
            endpoints: 'my-topic'
          }
        }
      };

      const result = spanName(span);
      expect(result).to.equal('send my-topic');
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
      expect(result).to.equal('pg.SELECT');
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
      expect(result).to.equal('mysql.INSERT');
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
      expect(result).to.equal('mongodb.find');
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
      expect(result).to.equal('S3.putObject');
    });

    it('should generate Lambda entry span name from functionName', () => {
      const span = {
        n: 'aws.lambda.entry',
        data: {
          lambda: {
            functionName: 'my-handler',
            trigger: 'aws:api.gateway'
          }
        }
      };

      const result = spanName(span);
      expect(result).to.equal('my-handler');
    });

    it('should generate graphql.server span name with operation type and name', () => {
      const span = {
        n: 'graphql.server',
        k: 1,
        data: {
          graphql: {
            operationType: 'query',
            operationName: 'GetUser'
          }
        }
      };

      const result = spanName(span);
      expect(result).to.equal('query');
    });

    it('should generate graphql.server span name with only operation type (no name)', () => {
      const span = {
        n: 'graphql.server',
        k: 1,
        data: {
          graphql: {
            operationType: 'mutation'
          }
        }
      };

      const result = spanName(span);
      expect(result).to.equal('mutation');
    });

    it('should generate graphql.client span name for subscription-update', () => {
      const span = {
        n: 'graphql.client',
        k: 2,
        data: {
          graphql: {
            operationType: 'subscription-update',
            operationName: 'OnCommentAdded'
          }
        }
      };

      const result = spanName(span);
      expect(result).to.equal('subscription-update');
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
    it('should map all AWS Lambda entry attributes (API Gateway / cold start)', () => {
      const span = {
        n: 'aws.lambda.entry',
        data: {
          lambda: {
            arn: 'arn:aws:lambda:us-east-1:123456789012:function:my-function:42',
            functionName: 'my-function',
            functionVersion: '$LATEST',
            runtime: 'nodejs',
            reqId: 'abc-123-req-id',
            coldStart: true,
            trigger: 'aws:api.gateway'
          }
        }
      };

      const result = spanAttributes(span);

      expect(result).to.be.an('array');

      const getAttr = key => result.find(a => a.key === key);

      expect(getAttr('faas.trigger').value).to.deep.equal({ stringValue: 'http' });
      expect(getAttr('faas.name').value).to.deep.equal({ stringValue: 'my-function' });
      expect(getAttr('faas.version').value).to.deep.equal({ stringValue: '$LATEST' });
      expect(getAttr('cloud.provider').value).to.deep.equal({ stringValue: 'aws' });
      expect(getAttr('cloud.platform').value).to.deep.equal({ stringValue: 'aws_lambda' });
      expect(getAttr('cloud.region').value).to.deep.equal({ stringValue: 'us-east-1' });
      expect(getAttr('cloud.account.id').value).to.deep.equal({ stringValue: '123456789012' });
      expect(getAttr('cloud.resource_id').value).to.deep.equal({
        stringValue: 'arn:aws:lambda:us-east-1:123456789012:function:my-function:42'
      });
      expect(getAttr('faas.invocation_id').value).to.deep.equal({ stringValue: 'abc-123-req-id' });
      expect(getAttr('faas.coldstart').value).to.deep.equal({ boolValue: true });
      expect(getAttr('process.runtime.name').value).to.deep.equal({ stringValue: 'nodejs' });
      expect(getAttr('exception.message')).to.be.undefined;
    });

    it('should map all AWS Lambda entry attributes (Lambda invoke trigger / error)', () => {
      const span = {
        n: 'aws.lambda.entry',
        data: {
          lambda: {
            arn: 'arn:aws:lambda:eu-west-1:987654321098:function:error-function:3',
            functionName: 'error-function',
            functionVersion: '3',
            runtime: 'nodejs',
            reqId: 'def-456-req-id',
            trigger: 'aws:lambda.invoke',
            error: 'Task timed out after 30.00 seconds'
          }
        }
      };

      const result = spanAttributes(span);

      const getAttr = key => result.find(a => a.key === key);

      expect(getAttr('faas.trigger').value).to.deep.equal({ stringValue: 'other' });
      expect(getAttr('cloud.region').value).to.deep.equal({ stringValue: 'eu-west-1' });
      expect(getAttr('cloud.account.id').value).to.deep.equal({ stringValue: '987654321098' });
      expect(getAttr('faas.coldstart')).to.be.undefined;
      expect(getAttr('exception.message').value).to.deep.equal({
        stringValue: 'Task timed out after 30.00 seconds'
      });
    });

    it('should map all Lambda trigger types to correct OTel faas.trigger values', () => {
      const triggerMap = [
        ['aws:api.gateway', 'http'],
        ['aws:api.gateway.noproxy', 'http'],
        ['aws:application.load.balancer', 'http'],
        ['aws:lambda.function.url', 'http'],
        ['aws:s3', 'datasource'],
        ['aws:dynamodb', 'datasource'],
        ['aws:kinesis', 'datasource'],
        ['aws:sqs', 'pubsub'],
        ['aws:sns', 'pubsub'],
        ['aws:cloudwatch.events', 'timer'],
        ['aws:lambda.invoke', 'other'],
        ['aws:cloudwatch.logs', 'other']
      ];

      triggerMap.forEach(([instanaTrigger, expectedOtelTrigger]) => {
        const span = {
          n: 'aws.lambda.entry',
          data: {
            lambda: {
              arn: 'arn:aws:lambda:us-east-1:123456789012:function:fn:1',
              trigger: instanaTrigger
            }
          }
        };

        const result = spanAttributes(span);
        const triggerAttr = result.find(a => a.key === 'faas.trigger');

        expect(triggerAttr, `Missing faas.trigger for ${instanaTrigger}`).to.exist;
        expect(triggerAttr.value.stringValue, `Wrong mapping for ${instanaTrigger}`).to.equal(expectedOtelTrigger);
      });
    });

    it('should convert coldStart string "true" to boolean true', () => {
      const span = {
        n: 'aws.lambda.entry',
        data: {
          lambda: {
            arn: 'arn:aws:lambda:us-east-1:123456789012:function:fn:1',
            coldStart: 'true'
          }
        }
      };

      const result = spanAttributes(span);
      const coldStartAttr = result.find(a => a.key === 'faas.coldstart');

      expect(coldStartAttr).to.exist;
      expect(coldStartAttr.value).to.deep.equal({ boolValue: true });
    });

    it('should convert coldStart string "false" to boolean false', () => {
      const span = {
        n: 'aws.lambda.entry',
        data: {
          lambda: {
            arn: 'arn:aws:lambda:us-east-1:123456789012:function:fn:1',
            coldStart: 'false'
          }
        }
      };

      const result = spanAttributes(span);
      const coldStartAttr = result.find(a => a.key === 'faas.coldstart');

      expect(coldStartAttr).to.exist;
      expect(coldStartAttr.value).to.deep.equal({ boolValue: false });
    });

    it('should extract HTTP attributes', () => {
      const span = {
        data: {
          http: {
            operation: 'POST',
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

    it('should map graphql.server span attributes (query with operation name)', () => {
      const span = {
        n: 'graphql.server',
        k: 1,
        data: {
          graphql: {
            operationType: 'query',
            operationName: 'GetUser',
            document: 'query GetUser { user { id name } }'
          }
        }
      };

      const result = spanAttributes(span);
      const getAttr = key => result.find(a => a.key === key);

      expect(getAttr('graphql.operation.type').value).to.deep.equal({ stringValue: 'query' });
      expect(getAttr('graphql.operation.name').value).to.deep.equal({ stringValue: 'GetUser' });
      expect(getAttr('error.type')).to.be.undefined;
    });

    it('should map graphql.server span attributes with errors', () => {
      const span = {
        n: 'graphql.server',
        k: 1,
        ec: 1,
        data: {
          graphql: {
            operationType: 'query',
            operationName: 'GetUser',
            errors: 'Cannot query field "bogus" on type "User"'
          }
        }
      };

      const result = spanAttributes(span);
      const getAttr = key => result.find(a => a.key === key);

      expect(getAttr('graphql.operation.type').value).to.deep.equal({ stringValue: 'query' });
      expect(getAttr('graphql.operation.name').value).to.deep.equal({ stringValue: 'GetUser' });
      expect(getAttr('error.type').value).to.deep.equal({
        stringValue: 'Cannot query field "bogus" on type "User"'
      });
      expect(getAttr('graphql.document')).to.be.undefined;
    });

    it('should map graphql.server span attributes for mutation', () => {
      const span = {
        n: 'graphql.server',
        k: 1,
        data: {
          graphql: {
            operationType: 'mutation',
            operationName: 'CreateUser'
          }
        }
      };

      const result = spanAttributes(span);
      const getAttr = key => result.find(a => a.key === key);

      expect(getAttr('graphql.operation.type').value).to.deep.equal({ stringValue: 'mutation' });
      expect(getAttr('graphql.operation.name').value).to.deep.equal({ stringValue: 'CreateUser' });
      expect(getAttr('graphql.document')).to.be.undefined;
      expect(getAttr('error.type')).to.be.undefined;
    });

    it('should map graphql.client span attributes for subscription-update', () => {
      const span = {
        n: 'graphql.client',
        k: 2,
        data: {
          graphql: {
            operationType: 'subscription-update',
            operationName: 'OnCommentAdded'
          }
        }
      };

      const result = spanAttributes(span);
      const getAttr = key => result.find(a => a.key === key);

      expect(getAttr('graphql.operation.type').value).to.deep.equal({ stringValue: 'subscription-update' });
      expect(getAttr('graphql.operation.name').value).to.deep.equal({ stringValue: 'OnCommentAdded' });
      expect(getAttr('graphql.document')).to.be.undefined;
      expect(getAttr('error.type')).to.be.undefined;
    });
  });

  describe('spanStatus', () => {
    it('should return UNSET status when span has no error', () => {
      const span = {
        n: 'node.http.server',
        data: {
          http: {
            operation: 'GET',
            path: '/api/users',
            status: 200
          }
        }
      };

      const result = spanStatus(span);

      expect(result).to.deep.equal({
        code: OTLP_STATUS_CODES.UNSET
      });
    });

    it('should return ERROR status when span.ec is set', () => {
      const span = {
        n: 'node.http.server',
        ec: 1,
        data: {
          http: {
            operation: 'GET',
            path: '/api/users',
            status: 500,
            error: 'Internal Server Error'
          }
        }
      };

      const result = spanStatus(span);

      expect(result).to.deep.equal({
        code: OTLP_STATUS_CODES.ERROR,
        message: 'Internal Server Error'
      });
    });

    it('should return ERROR status for HTTP client 4xx responses', () => {
      const span = {
        n: 'node.http.client',
        data: {
          http: {
            operation: 'GET',
            path: '/api/users',
            status: 404
          }
        }
      };

      const result = spanStatus(span);

      expect(result).to.deep.equal({
        code: OTLP_STATUS_CODES.ERROR,
        message: 'http failed'
      });
    });

    it('should return ERROR status for HTTP client 400 response', () => {
      const span = {
        n: 'node.http.client',
        data: {
          http: {
            operation: 'POST',
            path: '/api/users',
            status: 400
          }
        }
      };

      const result = spanStatus(span);

      expect(result).to.deep.equal({
        code: OTLP_STATUS_CODES.ERROR,
        message: 'http failed'
      });
    });

    it('should return ERROR status for HTTP client 499 response', () => {
      const span = {
        n: 'node.http.client',
        data: {
          http: {
            operation: 'GET',
            path: '/api/users',
            status: 499
          }
        }
      };

      const result = spanStatus(span);

      expect(result).to.deep.equal({
        code: OTLP_STATUS_CODES.ERROR,
        message: 'http failed'
      });
    });

    it('should NOT return ERROR status for HTTP client 5xx responses without ec', () => {
      const span = {
        n: 'node.http.client',
        data: {
          http: {
            operation: 'GET',
            path: '/api/users',
            status: 500
          }
        }
      };

      const result = spanStatus(span);

      // 5xx without ec should be UNSET (not in 4xx range)
      expect(result).to.deep.equal({
        code: OTLP_STATUS_CODES.UNSET
      });
    });

    it('should NOT return ERROR status for HTTP client 3xx responses', () => {
      const span = {
        n: 'node.http.client',
        data: {
          http: {
            operation: 'GET',
            path: '/api/users',
            status: 301
          }
        }
      };

      const result = spanStatus(span);

      expect(result).to.deep.equal({
        code: OTLP_STATUS_CODES.UNSET
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
        code: OTLP_STATUS_CODES.ERROR,
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
        code: OTLP_STATUS_CODES.ERROR,
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
        code: OTLP_STATUS_CODES.ERROR,
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
        code: OTLP_STATUS_CODES.ERROR,
        message: 'operation failed'
      });
    });
  });
});
