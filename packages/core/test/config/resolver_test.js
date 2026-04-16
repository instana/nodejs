/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const expect = require('chai').expect;
const { createFakeLogger } = require('../test_util');
const resolver = require('../../src/config/resolver');

describe('config.resolver', () => {
  let logger;

  before(() => {
    logger = createFakeLogger();
    resolver.init(logger);
  });

  beforeEach(() => {
    resolver.clearConfigStore();
  });

  afterEach(() => {
    resolver.clearConfigStore();

    delete process.env.TEST_ENV_VAR;
    delete process.env.INSTANA_SERVICE_NAME;
    delete process.env.INSTANA_AGENT_PORT;
    delete process.env.INSTANA_TRACING_ENABLED;
  });

  describe('init', () => {
    it('should initialize with a logger', () => {
      const testLogger = createFakeLogger();
      resolver.init(testLogger);

      expect(() => resolver.clearConfigStore()).to.not.throw();
    });
  });

  describe('get - string type', () => {
    it('should resolve from environment variable with highest priority', () => {
      process.env.TEST_ENV_VAR = 'env-value';
      const result = resolver.get({
        key: 'testKey',
        envKey: 'TEST_ENV_VAR',
        inCodeValue: 'code-value',
        defaultValue: 'default-value',
        type: 'STR'
      });
      expect(result).to.equal('env-value');
    });

    it('should resolve from in-code value when env is not set', () => {
      const result = resolver.get({
        key: 'testKey',
        envKey: 'TEST_ENV_VAR',
        inCodeValue: 'code-value',
        defaultValue: 'default-value',
        type: 'STR'
      });
      expect(result).to.equal('code-value');
    });

    it('should resolve from default value when env and in-code are not set', () => {
      const result = resolver.get({
        key: 'testKey',
        envKey: 'TEST_ENV_VAR',
        inCodeValue: undefined,
        defaultValue: 'default-value',
        type: 'STR'
      });
      expect(result).to.equal('default-value');
    });

    it('should reject empty string from environment', () => {
      process.env.TEST_ENV_VAR = '';
      const result = resolver.get({
        key: 'testKey',
        envKey: 'TEST_ENV_VAR',
        inCodeValue: 'code-value',
        defaultValue: 'default-value',
        type: 'STR'
      });
      expect(result).to.equal('code-value');
    });

    it('should reject "null" string from environment', () => {
      process.env.TEST_ENV_VAR = 'null';
      const result = resolver.get({
        key: 'testKey',
        envKey: 'TEST_ENV_VAR',
        inCodeValue: 'code-value',
        defaultValue: 'default-value',
        type: 'STR'
      });
      expect(result).to.equal('code-value');
    });

    it('should reject "undefined" string from environment', () => {
      process.env.TEST_ENV_VAR = 'undefined';
      const result = resolver.get({
        key: 'testKey',
        envKey: 'TEST_ENV_VAR',
        inCodeValue: 'code-value',
        defaultValue: 'default-value',
        type: 'STR'
      });
      expect(result).to.equal('code-value');
    });

    it('should handle null in-code value', () => {
      const result = resolver.get({
        key: 'testKey',
        envKey: 'TEST_ENV_VAR',
        inCodeValue: null,
        defaultValue: 'default-value',
        type: 'STR'
      });
      expect(result).to.equal('default-value');
    });

    it('should store config entry with correct source', () => {
      process.env.TEST_ENV_VAR = 'env-value';
      resolver.get({
        key: 'testKey',
        envKey: 'TEST_ENV_VAR',
        inCodeValue: 'code-value',
        defaultValue: 'default-value',
        type: 'STR'
      });
      const entry = resolver.getConfigStore('testKey');
      expect(entry).to.exist;
      expect(entry.source).to.equal('ENV');
    });
  });

  describe('get - number type', () => {
    it('should resolve number from environment variable', () => {
      process.env.INSTANA_AGENT_PORT = '8080';
      const result = resolver.get({
        key: 'agentPort',
        envKey: 'INSTANA_AGENT_PORT',
        inCodeValue: 9090,
        defaultValue: 42699,
        type: 'NUM'
      });
      expect(result).to.equal(8080);
    });

    it('should resolve number from in-code value', () => {
      const result = resolver.get({
        key: 'agentPort',
        envKey: 'INSTANA_AGENT_PORT',
        inCodeValue: 9090,
        defaultValue: 42699,
        type: 'NUM'
      });
      expect(result).to.equal(9090);
    });

    it('should resolve number from default value', () => {
      const result = resolver.get({
        key: 'agentPort',
        envKey: 'INSTANA_AGENT_PORT',
        inCodeValue: undefined,
        defaultValue: 42699,
        type: 'NUM'
      });
      expect(result).to.equal(42699);
    });

    it('should reject invalid number from environment', () => {
      process.env.INSTANA_AGENT_PORT = 'not-a-number';
      const result = resolver.get({
        key: 'agentPort',
        envKey: 'INSTANA_AGENT_PORT',
        inCodeValue: 9090,
        defaultValue: 42699,
        type: 'NUM'
      });
      expect(result).to.equal(9090);
    });

    it('should handle zero as valid number', () => {
      process.env.INSTANA_AGENT_PORT = '0';
      const result = resolver.get({
        key: 'agentPort',
        envKey: 'INSTANA_AGENT_PORT',
        inCodeValue: 9090,
        defaultValue: 42699,
        type: 'NUM'
      });
      expect(result).to.equal(0);
    });

    it('should handle negative numbers', () => {
      process.env.INSTANA_AGENT_PORT = '-100';
      const result = resolver.get({
        key: 'agentPort',
        envKey: 'INSTANA_AGENT_PORT',
        inCodeValue: 9090,
        defaultValue: 42699,
        type: 'NUM'
      });
      expect(result).to.equal(-100);
    });

    it('should reject empty string as number', () => {
      process.env.INSTANA_AGENT_PORT = '';
      const result = resolver.get({
        key: 'agentPort',
        envKey: 'INSTANA_AGENT_PORT',
        inCodeValue: 9090,
        defaultValue: 42699,
        type: 'NUM'
      });
      expect(result).to.equal(9090);
    });

    it('should handle floating point numbers', () => {
      process.env.INSTANA_AGENT_PORT = '3.14';
      const result = resolver.get({
        key: 'agentPort',
        envKey: 'INSTANA_AGENT_PORT',
        inCodeValue: 9090,
        defaultValue: 42699,
        type: 'NUM'
      });
      expect(result).to.equal(3.14);
    });
  });

  describe('get - boolean type', () => {
    it('should resolve boolean true from environment variable', () => {
      process.env.INSTANA_TRACING_ENABLED = 'true';
      const result = resolver.get({
        key: 'tracingEnabled',
        envKey: 'INSTANA_TRACING_ENABLED',
        inCodeValue: false,
        defaultValue: true,
        type: 'BOOL'
      });
      expect(result).to.equal(true);
    });

    it('should resolve boolean false from environment variable', () => {
      process.env.INSTANA_TRACING_ENABLED = 'false';
      const result = resolver.get({
        key: 'tracingEnabled',
        envKey: 'INSTANA_TRACING_ENABLED',
        inCodeValue: true,
        defaultValue: true,
        type: 'BOOL'
      });
      expect(result).to.equal(false);
    });

    it('should resolve "1" as true', () => {
      process.env.INSTANA_TRACING_ENABLED = '1';
      const result = resolver.get({
        key: 'tracingEnabled',
        envKey: 'INSTANA_TRACING_ENABLED',
        inCodeValue: false,
        defaultValue: false,
        type: 'BOOL'
      });
      expect(result).to.equal(true);
    });

    it('should resolve "0" as false', () => {
      process.env.INSTANA_TRACING_ENABLED = '0';
      const result = resolver.get({
        key: 'tracingEnabled',
        envKey: 'INSTANA_TRACING_ENABLED',
        inCodeValue: true,
        defaultValue: true,
        type: 'BOOL'
      });
      expect(result).to.equal(false);
    });

    it('should resolve boolean from in-code value', () => {
      const result = resolver.get({
        key: 'tracingEnabled',
        envKey: 'INSTANA_TRACING_ENABLED',
        inCodeValue: false,
        defaultValue: true,
        type: 'BOOL'
      });
      expect(result).to.equal(false);
    });

    it('should resolve boolean from default value', () => {
      const result = resolver.get({
        key: 'tracingEnabled',
        envKey: 'INSTANA_TRACING_ENABLED',
        inCodeValue: undefined,
        defaultValue: true,
        type: 'BOOL'
      });
      expect(result).to.equal(true);
    });

    it('should reject invalid boolean from environment', () => {
      process.env.INSTANA_TRACING_ENABLED = 'yes';
      const result = resolver.get({
        key: 'tracingEnabled',
        envKey: 'INSTANA_TRACING_ENABLED',
        inCodeValue: false,
        defaultValue: true,
        type: 'BOOL'
      });
      expect(result).to.equal(false);
    });

    it('should reject empty string as boolean', () => {
      process.env.INSTANA_TRACING_ENABLED = '';
      const result = resolver.get({
        key: 'tracingEnabled',
        envKey: 'INSTANA_TRACING_ENABLED',
        inCodeValue: false,
        defaultValue: true,
        type: 'BOOL'
      });
      expect(result).to.equal(false);
    });
  });

  describe('get - type validation', () => {
    it('should default to STR for unknown type', () => {
      const result = resolver.get({
        key: 'testKey',
        envKey: 'TEST_ENV_VAR',
        inCodeValue: 'value',
        defaultValue: 'default',
        type: 'UNKNOWN_TYPE'
      });
      expect(result).to.equal('default');
    });

    it('should use STR as default type when not specified', () => {
      process.env.TEST_ENV_VAR = 'env-value';
      const result = resolver.get({
        key: 'testKey',
        envKey: 'TEST_ENV_VAR',
        inCodeValue: 'code-value',
        defaultValue: 'default-value'
      });
      expect(result).to.equal('env-value');
    });
  });

  describe('update', () => {
    it('should update config value from agent source', () => {
      resolver.get({
        key: 'serviceName',
        envKey: 'INSTANA_SERVICE_NAME',
        inCodeValue: undefined,
        defaultValue: 'default-service',
        type: 'STR'
      });

      const result = resolver.update({
        key: 'serviceName',
        newValue: 'agent-service',
        sourceName: 'AGENT'
      });

      expect(result).to.equal('agent-service');
      const entry = resolver.getConfigStore('serviceName');
      expect(entry.source).to.equal('AGENT');
    });

    it('should reject update from lower priority source', () => {
      resolver.get({
        key: 'serviceName',
        envKey: 'INSTANA_SERVICE_NAME',
        inCodeValue: 'code-service',
        defaultValue: 'default-service',
        type: 'STR'
      });

      const result = resolver.update({
        key: 'serviceName',
        newValue: 'agent-service',
        sourceName: 'AGENT'
      });

      expect(result).to.be.undefined;
      const entry = resolver.getConfigStore('serviceName');
      expect(entry.source).to.equal('IN_CODE');
    });

    it('should reject update from equal priority source', () => {
      // Set from agent (priority 2)
      resolver.get({
        key: 'serviceName',
        envKey: 'INSTANA_SERVICE_NAME',
        inCodeValue: undefined,
        defaultValue: 'default-service',
        type: 'STR'
      });
      resolver.update({
        key: 'serviceName',
        newValue: 'agent-service-1',
        sourceName: 'AGENT'
      });

      const result = resolver.update({
        key: 'serviceName',
        newValue: 'agent-service-2',
        sourceName: 'AGENT'
      });

      expect(result).to.be.undefined;
    });

    it('should allow update from higher priority source', () => {
      resolver.get({
        key: 'serviceName',
        envKey: 'INSTANA_SERVICE_NAME',
        inCodeValue: undefined,
        defaultValue: 'default-service',
        type: 'STR'
      });

      const result = resolver.update({
        key: 'serviceName',
        newValue: 'code-service',
        sourceName: 'IN_CODE'
      });

      expect(result).to.equal('code-service');
      const entry = resolver.getConfigStore('serviceName');
      expect(entry.source).to.equal('IN_CODE');
    });

    it('should reject null value', () => {
      resolver.get({
        key: 'serviceName',
        envKey: 'INSTANA_SERVICE_NAME',
        inCodeValue: undefined,
        defaultValue: 'default-service',
        type: 'STR'
      });

      const result = resolver.update({
        key: 'serviceName',
        newValue: null,
        sourceName: 'AGENT'
      });

      expect(result).to.be.undefined;
    });

    it('should reject undefined value', () => {
      resolver.get({
        key: 'serviceName',
        envKey: 'INSTANA_SERVICE_NAME',
        inCodeValue: undefined,
        defaultValue: 'default-service',
        type: 'STR'
      });

      const result = resolver.update({
        key: 'serviceName',
        newValue: undefined,
        sourceName: 'AGENT'
      });

      expect(result).to.be.undefined;
    });

    it('should reject empty string value', () => {
      resolver.get({
        key: 'serviceName',
        envKey: 'INSTANA_SERVICE_NAME',
        inCodeValue: undefined,
        defaultValue: 'default-service',
        type: 'STR'
      });

      const result = resolver.update({
        key: 'serviceName',
        newValue: '',
        sourceName: 'AGENT'
      });

      expect(result).to.be.undefined;
    });

    it('should reject invalid source name', () => {
      resolver.get({
        key: 'serviceName',
        envKey: 'INSTANA_SERVICE_NAME',
        inCodeValue: undefined,
        defaultValue: 'default-service',
        type: 'STR'
      });

      const result = resolver.update({
        key: 'serviceName',
        newValue: 'new-service',
        sourceName: 'INVALID_SOURCE'
      });

      expect(result).to.be.undefined;
    });

    it('should allow update for non-existent key', () => {
      const result = resolver.update({
        key: 'newKey',
        newValue: 'new-value',
        sourceName: 'AGENT'
      });

      expect(result).to.equal('new-value');
      const entry = resolver.getConfigStore('newKey');
      expect(entry.source).to.equal('AGENT');
    });

    it('should not allow ENV source to be overridden', () => {
      process.env.INSTANA_SERVICE_NAME = 'env-service';
      resolver.get({
        key: 'serviceName',
        envKey: 'INSTANA_SERVICE_NAME',
        inCodeValue: 'code-service',
        defaultValue: 'default-service',
        type: 'STR'
      });

      const result = resolver.update({
        key: 'serviceName',
        newValue: 'updated-service',
        sourceName: 'IN_CODE'
      });

      expect(result).to.be.undefined;
      const entry = resolver.getConfigStore('serviceName');
      expect(entry.source).to.equal('ENV');
    });
  });

  describe('getConfigStore', () => {
    it('should return config entry for existing key', () => {
      resolver.get({
        key: 'testKey',
        envKey: 'TEST_ENV_VAR',
        inCodeValue: 'code-value',
        defaultValue: 'default-value',
        type: 'STR'
      });

      const entry = resolver.getConfigStore('testKey');
      expect(entry).to.exist;
      expect(entry.source).to.equal('IN_CODE');
    });

    it('should return null for non-existent key', () => {
      const entry = resolver.getConfigStore('nonExistentKey');
      expect(entry).to.be.null;
    });

    it('should return correct source after update', () => {
      resolver.get({
        key: 'testKey',
        envKey: 'TEST_ENV_VAR',
        inCodeValue: undefined,
        defaultValue: 'default-value',
        type: 'STR'
      });

      resolver.update({
        key: 'testKey',
        newValue: 'agent-value',
        sourceName: 'AGENT'
      });

      const entry = resolver.getConfigStore('testKey');
      expect(entry.source).to.equal('AGENT');
    });
  });

  describe('clearConfigStore', () => {
    it('should clear all config entries', () => {
      resolver.get({
        key: 'key1',
        envKey: 'TEST_ENV_VAR_1',
        inCodeValue: 'value1',
        defaultValue: 'default1',
        type: 'STR'
      });

      resolver.get({
        key: 'key2',
        envKey: 'TEST_ENV_VAR_2',
        inCodeValue: 'value2',
        defaultValue: 'default2',
        type: 'STR'
      });

      resolver.clearConfigStore();

      expect(resolver.getConfigStore('key1')).to.be.null;
      expect(resolver.getConfigStore('key2')).to.be.null;
    });

    it('should allow new entries after clearing', () => {
      resolver.get({
        key: 'testKey',
        envKey: 'TEST_ENV_VAR',
        inCodeValue: 'value',
        defaultValue: 'default',
        type: 'STR'
      });

      resolver.clearConfigStore();

      resolver.get({
        key: 'newKey',
        envKey: 'NEW_ENV_VAR',
        inCodeValue: 'new-value',
        defaultValue: 'new-default',
        type: 'STR'
      });

      expect(resolver.getConfigStore('testKey')).to.be.null;
      expect(resolver.getConfigStore('newKey')).to.exist;
    });
  });

  describe('priority order integration', () => {
    it('should follow ENV > IN_CODE > AGENT > DEFAULT priority', () => {
      const result1 = resolver.get({
        key: 'priority-test',
        envKey: 'PRIORITY_TEST',
        inCodeValue: undefined,
        defaultValue: 'default-value',
        type: 'STR'
      });
      expect(result1).to.equal('default-value');
      expect(resolver.getConfigStore('priority-test').source).to.equal('DEFAULT');

      resolver.clearConfigStore();
      resolver.get({
        key: 'priority-test',
        envKey: 'PRIORITY_TEST',
        inCodeValue: undefined,
        defaultValue: 'default-value',
        type: 'STR'
      });
      resolver.update({
        key: 'priority-test',
        newValue: 'agent-value',
        sourceName: 'AGENT'
      });
      expect(resolver.getConfigStore('priority-test').source).to.equal('AGENT');

      resolver.clearConfigStore();
      const result3 = resolver.get({
        key: 'priority-test',
        envKey: 'PRIORITY_TEST',
        inCodeValue: 'code-value',
        defaultValue: 'default-value',
        type: 'STR'
      });
      expect(result3).to.equal('code-value');
      expect(resolver.getConfigStore('priority-test').source).to.equal('IN_CODE');

      resolver.clearConfigStore();
      process.env.PRIORITY_TEST = 'env-value';
      const result4 = resolver.get({
        key: 'priority-test',
        envKey: 'PRIORITY_TEST',
        inCodeValue: 'code-value',
        defaultValue: 'default-value',
        type: 'STR'
      });
      expect(result4).to.equal('env-value');
      expect(resolver.getConfigStore('priority-test').source).to.equal('ENV');

      delete process.env.PRIORITY_TEST;
    });
  });
});
