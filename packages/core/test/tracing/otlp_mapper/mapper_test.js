/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const expect = require('chai').expect;
const { transform, getOtlpAttributeMappings } = require('../../../src/tracing/otlp_mapper/mapper');

describe('tracing/otlp_mapper', () => {
  let span;

  describe('Dynamic Database Mappings', () => {
    it('should transform PostgreSQL span using common database mappings', () => {
      span = {
        n: 'pg',
        data: {
          pg: {
            stmt: 'SELECT * FROM users',
            host: 'localhost',
            port: 5432,
            user: 'admin',
            db: 'mydb'
          }
        }
      };

      const result = transform(span);
      expect(result.data.pg['db.statement']).to.equal('SELECT * FROM users');
      expect(result.data.pg['net.peer.name']).to.equal('localhost');
      expect(result.data.pg['net.peer.port']).to.equal(5432);
      expect(result.data.pg['db.user']).to.equal('admin');
      expect(result.data.pg['db.name']).to.equal('mydb');
      expect(result.data.pg).to.not.have.property('stmt');
      expect(result.data.pg).to.not.have.property('host');
      expect(result.data.pg).to.not.have.property('port');
      expect(result.data.pg).to.not.have.property('user');
      expect(result.data.pg).to.not.have.property('db');
    });

    it('should transform MySQL span using common database mappings', () => {
      span = {
        n: 'pg',
        data: {
          mysql: {
            stmt: 'INSERT INTO orders VALUES (1)',
            host: 'db.example.com',
            port: 3306,
            user: 'root',
            db: 'shop'
          }
        }
      };

      const result = transform(span);

      console.log(result);
      // Note: MySQL uses same fields as PostgreSQL (stmt, host, port, user, db)
      expect(result.data.mysql['db.statement']).to.equal('INSERT INTO orders VALUES (1)');
      expect(result.data.mysql['net.peer.name']).to.equal('db.example.com');
      expect(result.data.mysql['net.peer.port']).to.equal(3306);
      expect(result.data.mysql['db.user']).to.equal('root');
      expect(result.data.mysql['db.name']).to.equal('shop');
      expect(result.data.mysql).to.not.have.property('stmt');
      expect(result.data.mysql).to.not.have.property('host');
    });

    it('should transform MongoDB span using common database mappings', () => {
      span = {
        n: 'mongodb',
        data: {
          mongodb: {
            command: 'find',
            namespace: 'mydb.users',
            collection: 'users',
            host: 'mongo.local',
            port: 27017
          }
        }
      };

      const result = transform(span);
      expect(result.data.mongodb['db.operation.name']).to.equal('find');
      expect(result.data.mongodb['db.namespace']).to.equal('mydb.users');
      expect(result.data.mongodb['db.collection.name']).to.equal('users');
      expect(result.data.mongodb['net.peer.name']).to.equal('mongo.local');
      expect(result.data.mongodb['net.peer.port']).to.equal(27017);
      expect(result.data.mongodb).to.not.have.property('command');
      expect(result.data.mongodb).to.not.have.property('host');
    });

    it('should transform Redis span using common database mappings', () => {
      span = {
        n: 'redis',
        data: {
          redis: {
            command: 'GET',
            connection: 'redis://localhost:6379'
          }
        }
      };

      const result = transform(span);
      expect(result.data.redis['db.operation.name']).to.equal('GET');
      expect(result.data.redis['db.connection_string']).to.equal('redis://localhost:6379');
      expect(result.data.redis).to.not.have.property('command');
      expect(result.data.redis).to.not.have.property('connection');
    });

    it('should handle unmapped database fields with section prefix', () => {
      span = {
        n: 'pg',
        data: {
          pg: {
            stmt: 'SELECT 1',
            custom_field: 'custom_value'
          }
        }
      };

      const result = transform(span);
      expect(result.data.pg['db.statement']).to.equal('SELECT 1');
      expect(result.data.pg['pg.custom_field']).to.equal('custom_value');
      expect(result.data.pg).to.not.have.property('custom_field');
    });
  });

  describe('HTTP Mappings', () => {
    it('should transform HTTP span with specific HTTP mappings', () => {
      span = {
        n: 'node.http.server',
        data: {
          http: {
            method: 'GET',
            url: '/api/users',
            host: 'localhost',
            status: 200,
            path: '/api/users',
            protocol: 'HTTP/1.1'
          }
        }
      };

      const result = transform(span);
      expect(result.data.http['http.request.method']).to.equal('GET');
      expect(result.data.http['url.full']).to.equal('/api/users');
      expect(result.data.http['server.address']).to.equal('localhost');
      expect(result.data.http['http.response.status_code']).to.equal(200);
      expect(result.data.http['url.path']).to.equal('/api/users');
      expect(result.data.http['network.protocol.name']).to.equal('HTTP/1.1');
    });
  });

  describe('Messaging Mappings', () => {
    it('should transform Kafka span using messaging mappings', () => {
      span = {
        n: 'kafka',
        data: {
          kafka: {
            service: 'my-topic',
            access: 'produce'
          }
        }
      };

      const result = transform(span);
      expect(result.data.kafka['messaging.destination.name']).to.equal('my-topic');
      expect(result.data.kafka['messaging.operation.type']).to.equal('produce');
      expect(result.data.kafka).to.not.have.property('service');
      expect(result.data.kafka).to.not.have.property('access');
    });
  });

  describe('getOtlpAttributeMappings', () => {
    it('should return mappings for all database types', () => {
      const mappings = getOtlpAttributeMappings();

      // Check that all database types have mappings
      expect(mappings).to.have.property('pg');
      expect(mappings).to.have.property('mysql');
      expect(mappings).to.have.property('mongodb');
      expect(mappings).to.have.property('redis');
      expect(mappings).to.have.property('mssql');
      expect(mappings).to.have.property('couchbase');
      expect(mappings).to.have.property('elasticsearch');
      expect(mappings).to.have.property('dynamodb');
      expect(mappings).to.have.property('db2');
      expect(mappings).to.have.property('memcached');
      expect(mappings).to.have.property('mongoose');
      expect(mappings).to.have.property('prisma');

      // Verify they all use the same database mappings
      expect(mappings.pg).to.deep.equal(mappings.mysql);
      expect(mappings.mysql).to.deep.equal(mappings.mongodb);
      expect(mappings.redis).to.deep.equal(mappings.pg);
    });

    it('should return HTTP and messaging mappings', () => {
      const mappings = getOtlpAttributeMappings();

      expect(mappings).to.have.property('http');
      expect(mappings).to.have.property('kafka');
      expect(mappings.http).to.have.property('method');
      expect(mappings.kafka).to.have.property('service');
    });
  });

  describe('HTTP OTLP Mappings (Integration with Backend Mapper)', () => {
    it('should transform backend-mapped http span fields to OTLP http attributes', () => {
      span = {
        n: 'node.http.server',
        data: {
          http: {
            method: 'GET',
            url: '/api/users',
            host: 'localhost',
            status: 200
          }
        }
      };

      const result = transform(span);

      // New OTel semantic conventions
      expect(result.data.http['http.request.method']).to.equal('GET');
      expect(result.data.http['url.full']).to.equal('/api/users');
      expect(result.data.http['server.address']).to.equal('localhost');
      expect(result.data.http['http.response.status_code']).to.equal(200);

      expect(result.data.http).to.not.have.property('method');
      expect(result.data.http).to.not.have.property('url');
      expect(result.data.http).to.not.have.property('host');
      expect(result.data.http).to.not.have.property('status');
    });

    it('should keep unmapped backend http fields as section-prefixed OTLP attributes', () => {
      span = {
        n: 'node.http.server',
        data: {
          http: {
            method: 'POST',
            url: '/orders',
            host: 'service.local',
            custom_header: 'x-test'
          }
        }
      };

      const result = transform(span);

      // New OTel semantic conventions
      expect(result.data.http['http.request.method']).to.equal('POST');
      expect(result.data.http['url.full']).to.equal('/orders');
      expect(result.data.http['server.address']).to.equal('service.local');
      expect(result.data.http['http.custom_header']).to.equal('x-test');
      expect(result.data.http).to.not.have.property('method');
      expect(result.data.http).to.not.have.property('url');
      expect(result.data.http).to.not.have.property('host');
      expect(result.data.http).to.not.have.property('custom_header');
    });

    it('should map additional HTTP fields according to OTel semantic conventions', () => {
      span = {
        n: 'node.http.client',
        data: {
          http: {
            method: 'GET',
            url: 'https://api.example.com/users?page=1',
            path: '/users',
            params: 'page=1',
            protocol: 'HTTP/1.1',
            path_tpl: '/users',
            error: 'timeout'
          }
        }
      };

      const result = transform(span);

      // Verify all new mappings
      expect(result.data.http['http.request.method']).to.equal('GET');
      expect(result.data.http['url.full']).to.equal('https://api.example.com/users?page=1');
      expect(result.data.http['url.path']).to.equal('/users');
      expect(result.data.http['url.query']).to.equal('page=1');
      expect(result.data.http['network.protocol.name']).to.equal('HTTP/1.1');
      expect(result.data.http['url.template']).to.equal('/users');
      expect(result.data.http['error.type']).to.equal('timeout');

      // Verify old fields are removed
      expect(result.data.http).to.not.have.property('method');
      expect(result.data.http).to.not.have.property('url');
      expect(result.data.http).to.not.have.property('path');
      expect(result.data.http).to.not.have.property('params');
      expect(result.data.http).to.not.have.property('protocol');
      expect(result.data.http).to.not.have.property('path_tpl');
      expect(result.data.http).to.not.have.property('error');
    });
  });

  describe('Edge Cases', () => {
    it('should return span unchanged if data is null', () => {
      span = { n: 'test', data: null };
      const result = transform(span);
      expect(result).to.equal(span);
    });

    it('should return span unchanged if span is null', () => {
      const result = transform(null);
      expect(result).to.equal(null);
    });

    it('should skip non-object data sections', () => {
      span = {
        n: 'test',
        data: {
          pg: { stmt: 'SELECT 1' },
          stringField: 'value',
          numberField: 123
        }
      };

      const result = transform(span);
      expect(result.data.pg['db.statement']).to.equal('SELECT 1');
      expect(result.data.stringField).to.equal('value');
      expect(result.data.numberField).to.equal(123);
    });

    it('should handle spans with no matching mappings', () => {
      span = {
        n: 'custom',
        data: {
          custom: { field: 'value' }
        }
      };

      const result = transform(span);
      expect(result.data.custom.field).to.equal('value');
    });
  });
});

// Made with Bob
