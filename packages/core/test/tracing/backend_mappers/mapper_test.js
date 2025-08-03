/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const expect = require('chai').expect;
const { transform } = require('../../../src/tracing/backend_mappers');

describe('tracing/backend_mappers', () => {
  let span;

  beforeEach(() => {
    span = { n: 'redis', t: '1234567803', s: '1234567892', p: '1234567891', data: { redis: { operation: 'GET' } } };
  });

  describe('Redis Mapper', () => {
    it('should transform redis span using the redis mapper', () => {
      const result = transform(span);
      expect(result.data.redis.command).equal('GET');
      expect(result.data.redis).to.not.have.property('operation');
    });

    it('should not modify fields that need not be transformed in the redis span', () => {
      span = { data: { redis: { command: 'SET' }, otherField: 'value' } };

      const result = transform(span);
      expect(result.data.redis).to.not.have.property('operation');
      expect(result.data.redis.command).to.equal('SET');
      expect(result.data.otherField).to.equal('value');
    });

    it('should return the span unmodified if no mapper is found', () => {
      span.n = 'http';
      const result = transform(span);
      expect(result).to.equal(span);
    });

    it('should cache the mapper after the first load', () => {
      transform(span);
      expect(transform(span)).to.deep.equal(span);
    });
  });

  describe('DynamoDB Mapper', () => {
    beforeEach(() => {
      span = {
        n: 'dynamodb',
        t: '2234567803',
        s: '2234567892',
        p: '2234567891',
        data: { dynamodb: { operation: 'query' } }
      };
    });

    it('should transform dynamodb span using the dynamodb mapper', () => {
      const result = transform(span);
      expect(result.data.dynamodb.op).to.equal('query');
      expect(result.data.dynamodb).to.not.have.property('operation');
    });

    it('should not modify fields that need not be transformed in the dynamodb span', () => {
      span = { data: { dynamodb: { op: 'PutItem' }, otherField: 'value' } };

      const result = transform(span);
      expect(result.data.dynamodb).to.not.have.property('operation');
      expect(result.data.dynamodb.op).to.equal('PutItem');
      expect(result.data.otherField).to.equal('value');
    });

    it('should return the span unmodified if no mapper is found', () => {
      span.n = 'http';
      const result = transform(span);
      expect(result).to.equal(span);
    });

    it('should cache the mapper after the first load', () => {
      transform(span);
      expect(transform(span)).to.deep.equal(span);
    });
  });

  describe('HTTP Mapper', () => {
    it('should transform span with type node.http.server correctly', () => {
      span = {
        n: 'node.http.server',
        data: {
          http: {
            operation: 'GET',
            endpoints: '/api/users',
            connection: 'localhost'
          }
        }
      };

      const result = transform(span);
      expect(result.data.http.method).to.equal('GET');
      expect(result.data.http.url).to.equal('/api/users');
      expect(result.data.http.host).to.equal('localhost');
      expect(result.data.http).to.not.have.property('operation');
      expect(result.data.http).to.not.have.property('endpoints');
      expect(result.data.http).to.not.have.property('connection');
    });

    it('should transform span with type node.http.client correctly', () => {
      span = {
        n: 'node.http.client',
        data: {
          http: {
            operation: 'GET',
            endpoints: '/api/users',
            connection: 'localhost'
          }
        }
      };

      const result = transform(span);
      expect(result.data.http.method).to.equal('GET');
      expect(result.data.http.url).to.equal('/api/users');
      expect(result.data.http.host).to.equal('localhost');
      expect(result.data.http).to.not.have.property('operation');
      expect(result.data.http).to.not.have.property('endpoints');
      expect(result.data.http).to.not.have.property('connection');
    });

    it('should transform span with type graphql.server containing http and graphql data', () => {
      span = {
        n: 'graphql.server',
        data: {
          http: {
            operation: 'POST',
            endpoints: '/graphql',
            connection: '127.0.0.1'
          },
          graphql: {
            operationName: 'query'
          }
        }
      };

      const result = transform(span);

      // HTTP part
      expect(result.data.http.method).to.equal('POST');
      expect(result.data.http.url).to.equal('/graphql');
      expect(result.data.http.host).to.equal('127.0.0.1');
      expect(result.data.http).to.not.have.property('operation');
      expect(result.data.http).to.not.have.property('endpoints');
      expect(result.data.http).to.not.have.property('connection');

      // GraphQL part no changes
      expect(result.data.graphql.operationName).to.equal('query');
      expect(result.data.graphql).to.not.have.property('operation');
    });

    it('should leave span unchanged if no relevant keys are found in graphql.server', () => {
      span = {
        n: 'graphql.server',
        data: {
          graphql: {
            message: 'No mapping here'
          }
        }
      };

      const result = transform(span);
      expect(result).to.deep.equal(span);
    });
  });

  describe('Kafka Mapper', () => {
    beforeEach(() => {
      span = {
        n: 'kafka',
        t: '3234567803',
        s: '3234567892',
        p: '3234567891',
        data: {
          kafka: { operation: 'produce', endpoints: 'topic1' }
        }
      };
    });

    it('should correctly map "operation" to "access" and "endpoints" to "service"', () => {
      const result = transform(span);
      expect(result.data.kafka.access).to.equal('produce');
      expect(result.data.kafka.service).to.equal('topic1');
      expect(result.data.kafka).to.not.have.property('operation');
      expect(result.data.kafka).to.not.have.property('endpoints');
    });

    it('should leave already mapped fields unchanged', () => {
      span = {
        data: {
          kafka: { access: 'consume', service: 'topic1' },
          otherField: 'value'
        }
      };

      const result = transform(span);
      expect(result.data.kafka.access).to.equal('consume');
      expect(result.data.kafka.service).to.equal('topic1');
      expect(result.data.kafka).to.not.have.property('operation');
      expect(result.data.kafka).to.not.have.property('endpoints');
      expect(result.data.otherField).to.equal('value');
    });

    it('should return the span unchanged when no mapper is found for the span type', () => {
      span.n = 'grpc';
      const result = transform(span);
      expect(result).to.equal(span);
    });

    it('should produce consistent output when called multiple times on the same kafka span', () => {
      transform(span);
      expect(transform(span)).to.deep.equal(span);
    });
  });

  describe('Transform function with multiple entries in span.data', () => {
    beforeEach(() => {
      span = {
        n: 'kafka',
        t: '3234567803',
        s: '3234567892',
        p: '3234567891',
        data: {
          kafka: { operation: 'produce', endpoints: 'topic1' },
          otherField: { message: 'No mapping here' }
        }
      };
    });

    it('should remap specific kafka fields  while leaving unrelated fields unchanged', () => {
      const result = transform(span);

      expect(result.data.kafka.access).to.equal('produce');
      expect(result.data.kafka.service).to.equal('topic1');
      expect(result.data.kafka).to.not.have.property('operation');
      expect(result.data.kafka).to.not.have.property('endpoints');

      // Verify that non-kafka fields are preserved without modification
      expect(result.data.otherField).to.deep.equal({ message: 'No mapping here' });
    });
  });
});
