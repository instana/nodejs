/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const { normalizeConfig, fromEnv } = require('../../../src/util/configNormalizers/ignoreEndpoints');
const { expect } = require('chai');

describe('util.ignoreEndpoints', function () {
  describe('normalizeConfig', function () {
    it('should return an empty object for invalid inputs', function () {
      expect(normalizeConfig(null)).to.deep.equal({});
      expect(normalizeConfig(undefined)).to.deep.equal({});
      expect(normalizeConfig({})).to.deep.equal({});
      expect(normalizeConfig([])).to.deep.equal({});
    });

    it('should normalize service names and method names', function () {
      const input = { REDIS: ['GET '] };
      const expected = { redis: [{ methods: ['get'] }] };
      expect(normalizeConfig(input)).to.deep.equal(expected);
    });

    it('should return an empty array for services with empty configurations', function () {
      const input = { Redis: [] };
      const expected = { redis: [] };
      expect(normalizeConfig(input)).to.deep.equal(expected);
    });

    it('should normalize configurations with only method names', function () {
      const input = { Redis: ['GET', 'POST'] };
      const expected = { redis: [{ methods: ['get', 'post'] }] };
      expect(normalizeConfig(input)).to.deep.equal(expected);
    });

    it('should normalize configurations with methods and endpoints', function () {
      const input = {
        Kafka: [{ methods: ['consume', 'poll'], endpoints: ['topic1', 'topic2'] }]
      };
      const expected = {
        kafka: [{ methods: ['consume', 'poll'], endpoints: ['topic1', 'topic2'] }]
      };
      expect(normalizeConfig(input)).to.deep.equal(expected);
    });

    it('should normalize mixed configurations (methods and objects)', function () {
      const input = {
        kafka: ['consume', { methods: ['send'], endpoints: ['topic'] }]
      };
      const expected = {
        kafka: [{ methods: ['consume'] }, { methods: ['send'], endpoints: ['topic'] }]
      };
      expect(normalizeConfig(input)).to.deep.equal(expected);
    });

    it('should ignore unsupported object properties in configurations', function () {
      const input = {
        http: [{ methods: ['GET'], endpoints: ['/users'], invalidKey: 'value' }]
      };
      const expected = {
        http: [{ methods: ['get'], endpoints: ['/users'] }]
      };
      expect(normalizeConfig(input)).to.deep.equal(expected);
    });

    it('should return an empty array for services with empty string configurations', function () {
      const input = { Redis: '' };
      const expected = { redis: [] };
      expect(normalizeConfig(input)).to.deep.equal(expected);
    });

    it('should normalize single-string method definitions inside object configurations', function () {
      const input = {
        HTTP: [{ methods: 'GET', endpoints: ['/users'] }]
      };
      const expected = {
        http: [{ methods: ['get'], endpoints: ['/users'] }]
      };
      expect(normalizeConfig(input)).to.deep.equal(expected);
    });

    it('should normalize single-string endpoint definitions inside object configurations', function () {
      const input = {
        kafka: [{ methods: ['send'], endpoints: 'topic1' }]
      };
      const expected = {
        kafka: [{ methods: ['send'], endpoints: ['topic1'] }]
      };
      expect(normalizeConfig(input)).to.deep.equal(expected);
    });

    it('should normalize advanced configurations with spaces and different casing', function () {
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
      expect(normalizeConfig(input)).to.deep.equal(expected);
    });
  });

  describe('fromEnv', function () {
    it('should correctly parse a valid environment variable', function () {
      const input = 'redis:get,type; kafka:consume,publish';
      const expected = {
        redis: [{ methods: ['get', 'type'] }],
        kafka: [{ methods: ['consume', 'publish'] }]
      };
      expect(fromEnv(input)).to.deep.equal(expected);
    });

    it('should return an empty object for null or empty input', function () {
      expect(fromEnv(null)).to.deep.equal({});
      expect(fromEnv('')).to.deep.equal({});
    });

    it('should ignore entries with missing service name or endpoint list', function () {
      const input = 'redis:get,type; :consume; kafka:';
      const expected = {
        redis: [{ methods: ['get', 'type'] }]
      };
      expect(fromEnv(input)).to.deep.equal(expected);
    });

    it('should handle spaces and trim correctly', function () {
      const input = '  redis  :  get , type   ;  kafka : consume , publish  ';
      const expected = {
        redis: [{ methods: ['get', 'type'] }],
        kafka: [{ methods: ['consume', 'publish'] }]
      };
      expect(fromEnv(input)).to.deep.equal(expected);
    });

    it('should return an empty object if parsing fails', function () {
      const input = { notAString: true };
      expect(fromEnv(input)).to.deep.equal({});
    });
  });
});
