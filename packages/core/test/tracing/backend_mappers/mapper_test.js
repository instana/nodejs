/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const expect = require('chai').expect;
const { transform } = require('../../../src/tracing/backend_mappers');

describe('BE span transformation test', () => {
  let span;

  beforeEach(() => {
    span = { n: 'redis', t: '1234567803', s: '1234567892', p: '1234567891', data: { redis: { operation: 'GET' } } };
  });

  describe('should invoke transform function', () => {
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
});
