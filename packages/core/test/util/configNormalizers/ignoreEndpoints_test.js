/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { expect } = require('chai');
const { normalizeConfig, fromEnv, fromYaml } = require('../../../src/util/configNormalizers/ignoreEndpoints');

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

    it('should normalize connections', function () {
      const input = {
        kafka: [{ connections: ['127.168.0.1:6222'], methods: ['set'] }]
      };
      const expected = {
        kafka: [{ connections: ['127.168.0.1:6222'], methods: ['set'] }]
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

  describe('fromYaml', function () {
    const tracingYamlPath = path.resolve(__dirname, 'tracing.yaml');
    const comInstanaTracingYamlPath = path.resolve(__dirname, 'comInstanaTracing.yaml');
    const invalidTracingYamlPath = path.resolve(__dirname, 'invalidTracing.yaml');
    const invalidYamlPath = path.resolve(__dirname, 'invalid.yaml');
    const withoutIgnoreEndpointsYamlPath = path.resolve(__dirname, 'withoutIgnoreEndpoints.yaml');
    const withBasicFilteringYamlPath = path.resolve(__dirname, 'withBasicFiltering.yaml');

    before(() => {
      [
        tracingYamlPath,
        comInstanaTracingYamlPath,
        invalidTracingYamlPath,
        invalidYamlPath,
        withoutIgnoreEndpointsYamlPath,
        withBasicFilteringYamlPath
      ].forEach(filePath => {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });

      fs.writeFileSync(
        tracingYamlPath,
        `tracing:
          ignore-endpoints:
            kafka: 
              - methods: ["consume","publish"]
                endpoints: ["topic1","topic2"]`
      );

      fs.writeFileSync(
        comInstanaTracingYamlPath,
        `com.instana.tracing:
        ignore-endpoints:
          kafka: 
            - methods: ["consume","publish"]
              endpoints: ["topic1","topic2"]`
      );

      fs.writeFileSync(
        invalidTracingYamlPath,
        `instana-tracing:
          ignore-endpoints:
            kafka: 
              - methods: ["consume","publish"]
                endpoints: ["topic1","topic2"]`
      );

      fs.writeFileSync(
        withoutIgnoreEndpointsYamlPath,
        `tracing:
          sampling:
            kafka: 
              - methods: ["consume","publish"]
                endpoints: ["topic1","topic2"]`
      );

      fs.writeFileSync(
        withBasicFilteringYamlPath,
        `tracing:
          ignore-endpoints:
            redis: 
              - type
              - get
            kafka: 
              - methods: ["consume","publish"]
                endpoints: ["topic1","topic2"]`
      );
      fs.writeFileSync(invalidYamlPath, 'test.json');
    });

    after(() => {
      [
        tracingYamlPath,
        comInstanaTracingYamlPath,
        invalidTracingYamlPath,
        invalidYamlPath,
        withoutIgnoreEndpointsYamlPath,
        withBasicFilteringYamlPath
      ].forEach(filePath => {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });
    });

    it('should normalize YAML with "tracing" key', () => {
      const result = fromYaml(tracingYamlPath);
      expect(result).to.deep.equal({
        kafka: [{ methods: ['consume', 'publish'], endpoints: ['topic1', 'topic2'] }]
      });
    });

    it('should normalize YAML with "com.instana.tracing" key', () => {
      const result = fromYaml(comInstanaTracingYamlPath);
      expect(result).to.deep.equal({
        kafka: [{ methods: ['consume', 'publish'], endpoints: ['topic1', 'topic2'] }]
      });
    });

    it('should return an empty object  for invalid key "instana-tracing"', () => {
      const result = fromYaml(invalidTracingYamlPath);
      expect(result).to.deep.equal({});
    });

    it('should return an empty object for invalid YAML content', () => {
      const result = fromYaml(invalidYamlPath);
      expect(result).to.deep.equal({});
    });

    it('should return an empty object when ignore-endpoints not configured', () => {
      const result = fromYaml(withoutIgnoreEndpointsYamlPath);
      expect(result).to.deep.equal({});
    });

    it('should normalize YAML including basic filtering', () => {
      const result = fromYaml(withBasicFilteringYamlPath);
      expect(result).to.deep.equal({
        kafka: [{ methods: ['consume', 'publish'], endpoints: ['topic1', 'topic2'] }],
        redis: [{ methods: ['type', 'get'] }]
      });
    });
  });
});
