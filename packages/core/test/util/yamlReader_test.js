/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const fs = require('fs');
const path = require('path');
const sinon = require('sinon');
const { expect } = require('chai');
const { read, init } = require('../../src/util/yamlReader');

describe('yamlReader.read', () => {
  let mockLogger;

  const tracingYamlPath = path.resolve(__dirname, 'tracing.yaml');
  const emptyTracingYamlPath = path.resolve(__dirname, 'emptyTracing.yaml');
  const noIgnoreEndpointsYamlPath = path.resolve(__dirname, 'noIgnoreEndpoints.yaml');
  const invalidYamlPath = path.resolve(__dirname, 'invalid.yaml');
  const deeplyInvalidYamlPath = path.resolve(__dirname, 'deeplyInvalid.yaml');

  before(() => {
    fs.writeFileSync(
      tracingYamlPath,
      `tracing:
        ignore-endpoints:
          redis:
            - type  
            - get
          kafka:
            - consume
            - publish
            - method: ['*'] 
              endpoints: ["topic1", "topic2"]
            - method: ["publish"]  
              endpoints: ["topic3"]`
    );

    fs.writeFileSync(emptyTracingYamlPath, 'tracing: {}');

    fs.writeFileSync(noIgnoreEndpointsYamlPath, 'tracing:\n  other-config: true');

    fs.writeFileSync(
      invalidYamlPath,
      `tracing:
          ignore-endpoints:
           redis
               - type
          - get`
    );

    fs.writeFileSync(
      deeplyInvalidYamlPath,
      `tracing:
        ignore-endpoints:
          redis:
            - type  
            - get
          kafka:
            - consume
            - publish
              method: ['*']
              endpoints: 
                - topic1
                - topic2`
    );
  });

  beforeEach(() => {
    mockLogger = { warn: sinon.spy() };
    init({ logger: mockLogger });
  });

  after(() => {
    fs.unlinkSync(tracingYamlPath);
    fs.unlinkSync(emptyTracingYamlPath);
    fs.unlinkSync(noIgnoreEndpointsYamlPath);
    fs.unlinkSync(invalidYamlPath);
    fs.unlinkSync(deeplyInvalidYamlPath);
  });

  it('should read and parse tracing configuration with ignore-endpoints', () => {
    const result = read(tracingYamlPath);
    expect(result).to.deep.equal({
      tracing: {
        'ignore-endpoints': {
          redis: ['type', 'get'],
          kafka: [
            'consume',
            'publish',
            { method: ['*'], endpoints: ['topic1', 'topic2'] },
            { method: ['publish'], endpoints: ['topic3'] }
          ]
        }
      }
    });
  });

  it('should return an empty object for an empty tracing section', () => {
    const result = read(emptyTracingYamlPath);
    expect(result).to.deep.equal({ tracing: {} });
  });

  it('should return tracing config when the YAML is valid', () => {
    const result = read(noIgnoreEndpointsYamlPath);
    expect(result).to.deep.equal({ tracing: { 'other-config': true } });
  });

  it('should return an empty object when the YAML file is malformed (incorrect indentation)', () => {
    const result = read(invalidYamlPath);
    expect(result).to.deep.equal({});
  });

  it('should return an empty object when YAML has deep nesting issues', () => {
    const result = read(deeplyInvalidYamlPath);
    expect(result).to.deep.equal({});
  });
  it('should return an empty object when the YAML file path is undefined', () => {
    const result = read(undefined);
    expect(result).to.deep.equal({});
  });

  it('should return an empty object when the YAML file path is null', () => {
    const result = read(null);
    expect(result).to.deep.equal({});
  });

  it('should return an empty object when the YAML file path is an empty string', () => {
    const result = read('');
    expect(result).to.deep.equal({});
  });
});
