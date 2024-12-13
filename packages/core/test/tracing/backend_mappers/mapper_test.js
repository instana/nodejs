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
});
