/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const expect = require('chai').expect;
const { transform: indexTransform } = require('../../../src/tracing/backend_mappers/index');

describe('Transformation Tests', () => {
  let span;

  beforeEach(() => {
    span = { n: 'redis', t: '1234567803', s: '1234567892', p: '1234567891', data: { redis: { operation: 'GET' } } };
  });

  describe('index.js transform function', () => {
    it('should transform span using the redis mapper for "redis"', () => {
      const result = indexTransform(span);
      expect(result.data.redis.command).equal('GET');
      expect(result.data.redis).to.not.have.property('operation');
    });
    it('should not modify other fields in the span', () => {
      span = { data: { redis: { command: 'SET' }, otherField: 'value' } };

      const result = indexTransform(span);

      expect(result.data.redis).to.not.have.property('operation');
      expect(result.data.redis.command).to.equal('SET');
      expect(result.data.otherField).to.equal('value');
    });

    it('should return the span unmodified if no mapper is found', () => {
      span.n = 'http';
      const result = indexTransform(span);
      expect(result).to.equal(span);
    });

    it('should cache the mapper after the first load', () => {
      indexTransform(span);
      expect(indexTransform(span)).to.deep.equal(span);
    });
  });
});
