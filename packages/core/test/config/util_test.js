/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const expect = require('chai').expect;
const { createFakeLogger } = require('../test_util');
const util = require('../../src/config/util');

describe('config.util', () => {
  let logger;

  before(() => {
    logger = createFakeLogger();
    util.init(logger);
  });

  beforeEach(resetEnv);
  afterEach(resetEnv);

  function resetEnv() {
    delete process.env.TEST_ENV_VAR;
  }

  describe('resolveNumericConfig', () => {
    it('should return the default value when no env var or config value is provided', () => {
      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        inCodeValue: undefined,
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.equal(1000);
    });

    it('should prioritize env var over config value', () => {
      process.env.TEST_ENV_VAR = '2000';

      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        inCodeValue: 3000,
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.equal(2000);
    });

    it('should use config value when env var is not set', () => {
      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        inCodeValue: 3000,
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.equal(3000);
    });

    it('should handle numeric config value', () => {
      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        inCodeValue: 5000,
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.equal(5000);
    });

    it('should handle string config value that can be parsed as number', () => {
      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        inCodeValue: '5000',
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.equal(5000);
    });

    it('should handle string env var that can be parsed as number', () => {
      process.env.TEST_ENV_VAR = '7500';

      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        inCodeValue: undefined,
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.equal(7500);
    });

    it('should fall back to default when env var is invalid', () => {
      process.env.TEST_ENV_VAR = 'not-a-number';

      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        inCodeValue: undefined,
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.equal(1000);
    });

    it('should fall back to default when config value is invalid', () => {
      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        inCodeValue: 'invalid',
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.equal(1000);
    });

    it('should use config value when env var is invalid', () => {
      process.env.TEST_ENV_VAR = 'not-a-number';

      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        inCodeValue: 3000,
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.equal(3000);
    });

    it('should handle zero as a valid value from env var', () => {
      process.env.TEST_ENV_VAR = '0';

      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        inCodeValue: undefined,
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.equal(0);
    });

    it('should handle zero as a valid value from config', () => {
      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        inCodeValue: 0,
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.equal(0);
    });

    it('should handle negative numbers from env var', () => {
      process.env.TEST_ENV_VAR = '-500';

      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        inCodeValue: undefined,
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.equal(-500);
    });

    it('should handle negative numbers from config', () => {
      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        inCodeValue: -500,
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.equal(-500);
    });

    it('should handle floating point numbers from env var', () => {
      process.env.TEST_ENV_VAR = '123.45';

      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        inCodeValue: undefined,
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.equal(123.45);
    });

    it('should handle floating point numbers from config', () => {
      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        inCodeValue: 123.45,
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.equal(123.45);
    });

    it('should handle null config value', () => {
      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        inCodeValue: null,
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.equal(1000);
    });

    it('should handle empty string env var as 0', () => {
      process.env.TEST_ENV_VAR = '';

      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        inCodeValue: undefined,
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.equal(0);
    });

    it('should handle empty string config value as 0', () => {
      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        inCodeValue: '',
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.equal(0);
    });
  });

  describe('resolveBooleanConfig', () => {
    beforeEach(() => {
      delete process.env.TEST_BOOL_VAR;
    });

    afterEach(() => {
      delete process.env.TEST_BOOL_VAR;
    });

    it('should return the default value when no env var or config value is provided', () => {
      const result = util.resolveBooleanConfig({
        envVar: 'TEST_BOOL_VAR',
        inCodeValue: undefined,
        defaultValue: false,
        configPath: 'config.test.bool'
      });

      expect(result).to.equal(false);
    });

    it('should prioritize env var over config value', () => {
      process.env.TEST_BOOL_VAR = 'true';

      const result = util.resolveBooleanConfig({
        envVar: 'TEST_BOOL_VAR',
        inCodeValue: false,
        defaultValue: false,
        configPath: 'config.test.bool'
      });

      expect(result).to.equal(true);
    });

    it('should use config value when env var is not set', () => {
      const result = util.resolveBooleanConfig({
        envVar: 'TEST_BOOL_VAR',
        inCodeValue: true,
        defaultValue: false,
        configPath: 'config.test.bool'
      });

      expect(result).to.equal(true);
    });

    it('should parse "true" from env var', () => {
      process.env.TEST_BOOL_VAR = 'true';

      const result = util.resolveBooleanConfig({
        envVar: 'TEST_BOOL_VAR',
        inCodeValue: undefined,
        defaultValue: false,
        configPath: 'config.test.bool'
      });

      expect(result).to.equal(true);
    });

    it('should parse "false" from env var', () => {
      process.env.TEST_BOOL_VAR = 'false';

      const result = util.resolveBooleanConfig({
        envVar: 'TEST_BOOL_VAR',
        inCodeValue: undefined,
        defaultValue: true,
        configPath: 'config.test.bool'
      });

      expect(result).to.equal(false);
    });

    it('should parse "1" from env var as true', () => {
      process.env.TEST_BOOL_VAR = '1';

      const result = util.resolveBooleanConfig({
        envVar: 'TEST_BOOL_VAR',
        inCodeValue: undefined,
        defaultValue: false,
        configPath: 'config.test.bool'
      });

      expect(result).to.equal(true);
    });

    it('should parse "0" from env var as false', () => {
      process.env.TEST_BOOL_VAR = '0';

      const result = util.resolveBooleanConfig({
        envVar: 'TEST_BOOL_VAR',
        inCodeValue: undefined,
        defaultValue: true,
        configPath: 'config.test.bool'
      });

      expect(result).to.equal(false);
    });

    it('should handle case-insensitive "TRUE" from env var', () => {
      process.env.TEST_BOOL_VAR = 'TRUE';

      const result = util.resolveBooleanConfig({
        envVar: 'TEST_BOOL_VAR',
        inCodeValue: undefined,
        defaultValue: false,
        configPath: 'config.test.bool'
      });

      expect(result).to.equal(true);
    });

    it('should handle case-insensitive "FALSE" from env var', () => {
      process.env.TEST_BOOL_VAR = 'FALSE';

      const result = util.resolveBooleanConfig({
        envVar: 'TEST_BOOL_VAR',
        inCodeValue: undefined,
        defaultValue: true,
        configPath: 'config.test.bool'
      });

      expect(result).to.equal(false);
    });

    it('should fall back to config value when env var is invalid', () => {
      process.env.TEST_BOOL_VAR = 'invalid';

      const result = util.resolveBooleanConfig({
        envVar: 'TEST_BOOL_VAR',
        inCodeValue: true,
        defaultValue: false,
        configPath: 'config.test.bool'
      });

      expect(result).to.equal(true);
    });

    it('should fall back to default when both env var and config value are invalid', () => {
      process.env.TEST_BOOL_VAR = 'invalid';

      const result = util.resolveBooleanConfig({
        envVar: 'TEST_BOOL_VAR',
        inCodeValue: 'not-a-boolean',
        defaultValue: true,
        configPath: 'config.test.bool'
      });

      expect(result).to.equal(true);
    });

    it('should handle null config value', () => {
      const result = util.resolveBooleanConfig({
        envVar: 'TEST_BOOL_VAR',
        inCodeValue: null,
        defaultValue: true,
        configPath: 'config.test.bool'
      });

      expect(result).to.equal(true);
    });

    it('should handle undefined config value', () => {
      const result = util.resolveBooleanConfig({
        envVar: 'TEST_BOOL_VAR',
        inCodeValue: undefined,
        defaultValue: false,
        configPath: 'config.test.bool'
      });

      expect(result).to.equal(false);
    });
  });

  describe('resolveBooleanConfigWithInvertedEnv', () => {
    beforeEach(() => {
      delete process.env.TEST_DISABLE_VAR;
    });

    afterEach(() => {
      delete process.env.TEST_DISABLE_VAR;
    });

    it('should return false when env var is "true" (inverted logic)', () => {
      process.env.TEST_DISABLE_VAR = 'true';

      const result = util.resolveBooleanConfigWithInvertedEnv({
        envVar: 'TEST_DISABLE_VAR',
        inCodeValue: undefined,
        defaultValue: true,
        configPath: 'config.test.disable'
      });

      expect(result).to.equal(false);
    });

    it('should prioritize env var over config value', () => {
      process.env.TEST_DISABLE_VAR = 'true';

      const result = util.resolveBooleanConfigWithInvertedEnv({
        envVar: 'TEST_DISABLE_VAR',
        inCodeValue: true,
        defaultValue: true,
        configPath: 'config.test.disable'
      });

      expect(result).to.equal(false);
    });

    it('should use config value when env var is not set', () => {
      const result = util.resolveBooleanConfigWithInvertedEnv({
        envVar: 'TEST_DISABLE_VAR',
        inCodeValue: false,
        defaultValue: true,
        configPath: 'config.test.disable'
      });

      expect(result).to.equal(false);
    });

    it('should use default when env var is not "true" and config is not set', () => {
      process.env.TEST_DISABLE_VAR = 'false';

      const result = util.resolveBooleanConfigWithInvertedEnv({
        envVar: 'TEST_DISABLE_VAR',
        inCodeValue: undefined,
        defaultValue: true,
        configPath: 'config.test.disable'
      });

      expect(result).to.equal(true);
    });

    it('should handle null config value', () => {
      const result = util.resolveBooleanConfigWithInvertedEnv({
        envVar: 'TEST_DISABLE_VAR',
        inCodeValue: null,
        defaultValue: false,
        configPath: 'config.test.disable'
      });

      expect(result).to.equal(false);
    });

    it('should return default when inCodeValue and env var are not boolean', () => {
      const result = util.resolveBooleanConfigWithInvertedEnv({
        envVar: 'TEST_INVERTED_VAR',
        inCodeValue: 'not-a-boolean',
        defaultValue: true,
        configPath: 'config.test.inverted'
      });

      expect(result).to.equal(true);
    });
  });

  describe('resolveBooleanConfigWithTruthyEnv', () => {
    beforeEach(() => {
      delete process.env.TEST_TRUTHY_VAR;
    });

    afterEach(() => {
      delete process.env.TEST_TRUTHY_VAR;
    });

    it('should return true when env var exists and is truthy', () => {
      process.env.TEST_TRUTHY_VAR = 'any-value';

      const result = util.resolveBooleanConfigWithTruthyEnv({
        envVar: 'TEST_TRUTHY_VAR',
        inCodeValue: undefined,
        defaultValue: false
      });

      expect(result).to.equal(true);
    });

    it('should return true when env var is "true"', () => {
      process.env.TEST_TRUTHY_VAR = 'true';

      const result = util.resolveBooleanConfigWithTruthyEnv({
        envVar: 'TEST_TRUTHY_VAR',
        inCodeValue: undefined,
        defaultValue: false
      });

      expect(result).to.equal(true);
    });

    it('should return true when env var is "1"', () => {
      process.env.TEST_TRUTHY_VAR = '1';

      const result = util.resolveBooleanConfigWithTruthyEnv({
        envVar: 'TEST_TRUTHY_VAR',
        inCodeValue: undefined,
        defaultValue: false
      });

      expect(result).to.equal(true);
    });

    it('should prioritize env var over config value', () => {
      process.env.TEST_TRUTHY_VAR = 'yes';

      const result = util.resolveBooleanConfigWithTruthyEnv({
        envVar: 'TEST_TRUTHY_VAR',
        inCodeValue: false,
        defaultValue: false
      });

      expect(result).to.equal(true);
    });

    it('should use config value when env var is not set', () => {
      const result = util.resolveBooleanConfigWithTruthyEnv({
        envVar: 'TEST_TRUTHY_VAR',
        inCodeValue: true,
        defaultValue: false
      });

      expect(result).to.equal(true);
    });

    it('should use default when env var is not set and config is not boolean', () => {
      const result = util.resolveBooleanConfigWithTruthyEnv({
        envVar: 'TEST_TRUTHY_VAR',
        inCodeValue: undefined,
        defaultValue: false
      });

      expect(result).to.equal(false);
    });

    it('should handle empty string env var as falsy', () => {
      process.env.TEST_TRUTHY_VAR = '';

      const result = util.resolveBooleanConfigWithTruthyEnv({
        envVar: 'TEST_TRUTHY_VAR',
        inCodeValue: undefined,
        defaultValue: false
      });

      expect(result).to.equal(false);
    });
  });

  describe('resolveStringConfig', () => {
    beforeEach(() => {
      delete process.env.TEST_STRING_VAR;
    });

    afterEach(() => {
      delete process.env.TEST_STRING_VAR;
    });

    it('should return the default value when no env var or config value is provided', () => {
      const result = util.resolveStringConfig({
        envVar: 'TEST_STRING_VAR',
        inCodeValue: undefined,
        defaultValue: 'default-value',
        configPath: 'config.test.string'
      });

      expect(result).to.equal('default-value');
    });

    it('should prioritize env var over config value', () => {
      process.env.TEST_STRING_VAR = 'env-value';

      const result = util.resolveStringConfig({
        envVar: 'TEST_STRING_VAR',
        inCodeValue: 'config-value',
        defaultValue: 'default-value',
        configPath: 'config.test.string'
      });

      expect(result).to.equal('env-value');
    });

    it('should use env var when config value is not set', () => {
      process.env.TEST_STRING_VAR = 'env-value';

      const result = util.resolveStringConfig({
        envVar: 'TEST_STRING_VAR',
        inCodeValue: undefined,
        defaultValue: 'default-value',
        configPath: 'config.test.string'
      });

      expect(result).to.equal('env-value');
    });

    it('should use config value when env var is not set', () => {
      const result = util.resolveStringConfig({
        envVar: 'TEST_STRING_VAR',
        inCodeValue: 'config-value',
        defaultValue: 'default-value',
        configPath: 'config.test.string'
      });

      expect(result).to.equal('config-value');
    });

    it('should handle empty string as a valid config value', () => {
      const result = util.resolveStringConfig({
        envVar: 'TEST_STRING_VAR',
        inCodeValue: '',
        defaultValue: 'default-value',
        configPath: 'config.test.string'
      });

      expect(result).to.equal('');
    });

    it('should handle empty string as a valid env var value', () => {
      process.env.TEST_STRING_VAR = '';

      const result = util.resolveStringConfig({
        envVar: 'TEST_STRING_VAR',
        inCodeValue: undefined,
        defaultValue: 'default-value',
        configPath: 'config.test.string'
      });

      expect(result).to.equal('');
    });

    it('should handle undefined config value as not set', () => {
      process.env.TEST_STRING_VAR = 'env-value';

      const result = util.resolveStringConfig({
        envVar: 'TEST_STRING_VAR',
        inCodeValue: undefined,
        defaultValue: 'default-value',
        configPath: 'config.test.string'
      });

      expect(result).to.equal('env-value');
    });

    it('should handle multiline string values', () => {
      const multilineValue = 'line1\nline2\nline3';
      const result = util.resolveStringConfig({
        envVar: undefined,
        inCodeValue: multilineValue,
        defaultValue: 'default-value',
        configPath: 'config.test.string'
      });

      expect(result).to.equal(multilineValue);
    });
  });
});
