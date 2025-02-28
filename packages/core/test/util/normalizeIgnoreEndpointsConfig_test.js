/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const normalizeIgnoreEndpointsConfig = require('../../src/util/normalizeIgnoreEndpointsConfig');
const { expect } = require('chai');

describe('normalizeIgnoreEndpointsConfig', function () {
  const mockLogger = { warn: () => {} };
  it('should return an empty object when input is not an object', function () {
    expect(normalizeIgnoreEndpointsConfig(null, mockLogger)).to.deep.equal({});
    expect(normalizeIgnoreEndpointsConfig(undefined, mockLogger)).to.deep.equal({});
    expect(normalizeIgnoreEndpointsConfig(42, mockLogger)).to.deep.equal({});
  });

  it('should normalize service names and configs', function () {
    const input = { REDIS: ['GET '] };
    const expected = { redis: [{ methods: ['get'] }] };
    expect(normalizeIgnoreEndpointsConfig(input)).to.deep.equal(expected);
  });

  it('should handle empty array configurations gracefully', function () {
    const input = { Redis: [] };
    const expected = { redis: [] };
    expect(normalizeIgnoreEndpointsConfig(input)).to.deep.equal(expected);
  });

  it('should normalize when only method names applied', function () {
    const input = { Redis: ['GET', 'POST'] };
    const expected = { redis: [{ methods: ['get', 'post'] }] };
    expect(normalizeIgnoreEndpointsConfig(input)).to.deep.equal(expected);
  });

  it('should normalize object configurations correctly', function () {
    const input = {
      Kafka: [{ methods: ['consume', 'poll'], endpoints: ['topic1', 'topic2'] }]
    };
    const expected = {
      kafka: [
        {
          methods: ['consume', 'poll'],
          endpoints: ['topic1', 'topic2']
        }
      ]
    };
    expect(normalizeIgnoreEndpointsConfig(input)).to.deep.equal(expected);
  });

  it('should handle mixed configurations (strings and objects)', function () {
    const input = {
      kafka: ['consume', { methods: ['send'], endpoints: ['topic'] }]
    };
    const expected = {
      kafka: [{ methods: ['consume'] }, { methods: ['send'], endpoints: ['topic'] }]
    };
    expect(normalizeIgnoreEndpointsConfig(input)).to.deep.equal(expected);
  });

  it('should ignore invalid object properties', function () {
    const input = {
      http: [{ methods: ['GET'], endpoints: ['/users'], invalidKey: 'value' }]
    };
    const expected = {
      http: [{ methods: ['get'], endpoints: ['/users'] }]
    };
    expect(normalizeIgnoreEndpointsConfig(input)).to.deep.equal(expected);
  });

  it('should return an empty array for empty endpoint configurations', function () {
    const input = { Redis: '' };
    const expected = { redis: [] };
    expect(normalizeIgnoreEndpointsConfig(input)).to.deep.equal(expected);
  });

  it('should normalize methods when defined as a single string in object configuration', function () {
    const input = {
      HTTP: [{ methods: 'GET', endpoints: ['/users'] }]
    };
    const expected = {
      http: [{ methods: ['get'], endpoints: ['/users'] }]
    };
    expect(normalizeIgnoreEndpointsConfig(input)).to.deep.equal(expected);
  });

  it('should normalize endpoints when defined as a single string in object configuration', function () {
    const input = {
      kafka: [{ methods: ['send'], endpoints: 'topic1' }]
    };
    const expected = {
      kafka: [{ methods: ['send'], endpoints: ['topic1'] }]
    };
    expect(normalizeIgnoreEndpointsConfig(input)).to.deep.equal(expected);
  });
});
