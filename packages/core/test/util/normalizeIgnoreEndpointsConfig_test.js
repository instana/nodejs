/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const normalizeIgnoreEndpointsConfig = require('../../src/util/normalizeIgnoreEndpointsConfig');
const { expect } = require('chai');

describe('normalizeIgnoreEndpointsConfig', function () {
  const mockLogger = { warn: () => {} };

  it('should return an empty object for invalid inputs', function () {
    expect(normalizeIgnoreEndpointsConfig(null, mockLogger)).to.deep.equal({});
    expect(normalizeIgnoreEndpointsConfig(undefined, mockLogger)).to.deep.equal({});
    expect(normalizeIgnoreEndpointsConfig({}, mockLogger)).to.deep.equal({});
    expect(normalizeIgnoreEndpointsConfig([], mockLogger)).to.deep.equal({});
  });

  it('should normalize service names and method names', function () {
    const input = { REDIS: ['GET '] };
    const expected = { redis: [{ methods: ['get'] }] };
    expect(normalizeIgnoreEndpointsConfig(input)).to.deep.equal(expected);
  });

  it('should return an empty array for services with empty configurations', function () {
    const input = { Redis: [] };
    const expected = { redis: [] };
    expect(normalizeIgnoreEndpointsConfig(input)).to.deep.equal(expected);
  });

  it('should normalize configurations with only method names', function () {
    const input = { Redis: ['GET', 'POST'] };
    const expected = { redis: [{ methods: ['get', 'post'] }] };
    expect(normalizeIgnoreEndpointsConfig(input)).to.deep.equal(expected);
  });

  it('should normalize configurations containing both methods and endpoints', function () {
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

  it('should correctly normalize mixed configurations (methods and objects)', function () {
    const input = {
      kafka: ['consume', { methods: ['send'], endpoints: ['topic'] }]
    };
    const expected = {
      kafka: [{ methods: ['consume'] }, { methods: ['send'], endpoints: ['topic'] }]
    };
    expect(normalizeIgnoreEndpointsConfig(input)).to.deep.equal(expected);
  });

  it('should ignore unsupported object properties in configurations', function () {
    const input = {
      http: [{ methods: ['GET'], endpoints: ['/users'], invalidKey: 'value' }]
    };
    const expected = {
      http: [{ methods: ['get'], endpoints: ['/users'] }]
    };
    expect(normalizeIgnoreEndpointsConfig(input)).to.deep.equal(expected);
  });

  it('should return an empty array for services with empty string configurations', function () {
    const input = { Redis: '' };
    const expected = { redis: [] };
    expect(normalizeIgnoreEndpointsConfig(input)).to.deep.equal(expected);
  });

  it('should normalize single-string method definitions inside object configurations', function () {
    const input = {
      HTTP: [{ methods: 'GET', endpoints: ['/users'] }]
    };
    const expected = {
      http: [{ methods: ['get'], endpoints: ['/users'] }]
    };
    expect(normalizeIgnoreEndpointsConfig(input)).to.deep.equal(expected);
  });

  it('should normalize single-string endpoint definitions inside object configurations', function () {
    const input = {
      kafka: [{ methods: ['send'], endpoints: 'topic1' }]
    };
    const expected = {
      kafka: [{ methods: ['send'], endpoints: ['topic1'] }]
    };
    expect(normalizeIgnoreEndpointsConfig(input)).to.deep.equal(expected);
  });
  it('should correctly normalize when advanced endpoint configurations with spaces and different casing', function () {
    const input = {
      'KAFKA  ': [
        {
          'Methods  ': ['*'],
          Endpoints: ['TOPIC1  ', 'topic2   ']
        },
        {
          METHODS: ['  PUBLISH'],
          '    endpoints': ['Topic3  ']
        }
      ]
    };
    const expected = {
      kafka: [
        { methods: ['*'], endpoints: ['topic1', 'topic2'] },
        { methods: ['publish'], endpoints: ['topic3'] }
      ]
    };
    expect(normalizeIgnoreEndpointsConfig(input)).to.deep.equal(expected);
  });
});
