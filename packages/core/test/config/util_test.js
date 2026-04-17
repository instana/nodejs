/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const expect = require('chai').expect;
const { createFakeLogger } = require('../test_util');
const util = require('../../src/config/util');
const { CONFIG_SOURCES } = require('../../src/util/constants');

describe.skip('config.util', () => {
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
        configValue: undefined,
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: 1000,
        source: CONFIG_SOURCES.DEFAULT,
        configPath: 'config.test.value'
      });
    });

    it('should prioritize env var over config value', () => {
      process.env.TEST_ENV_VAR = '2000';

      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        configValue: 3000,
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: 2000,
        source: CONFIG_SOURCES.ENV,
        configPath: 'config.test.value'
      });
    });

    it('should use config value when env var is not set', () => {
      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        configValue: 3000,
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: 3000,
        source: CONFIG_SOURCES.INCODE,
        configPath: 'config.test.value'
      });
    });

    it('should handle numeric config value', () => {
      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        configValue: 5000,
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: 5000,
        source: CONFIG_SOURCES.INCODE,
        configPath: 'config.test.value'
      });
    });

    it('should handle string config value that can be parsed as number', () => {
      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        configValue: '5000',
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: 5000,
        source: CONFIG_SOURCES.INCODE,
        configPath: 'config.test.value'
      });
    });

    it('should handle string env var that can be parsed as number', () => {
      process.env.TEST_ENV_VAR = '7500';

      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        configValue: undefined,
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: 7500,
        source: CONFIG_SOURCES.ENV,
        configPath: 'config.test.value'
      });
    });

    it('should fall back to default when env var is invalid', () => {
      process.env.TEST_ENV_VAR = 'not-a-number';

      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        configValue: undefined,
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: 1000,
        source: CONFIG_SOURCES.DEFAULT,
        configPath: 'config.test.value'
      });
    });

    it('should fall back to default when config value is invalid', () => {
      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        configValue: 'invalid',
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: 1000,
        source: CONFIG_SOURCES.DEFAULT,
        configPath: 'config.test.value'
      });
    });

    it('should use config value when env var is invalid', () => {
      process.env.TEST_ENV_VAR = 'not-a-number';

      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        configValue: 3000,
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: 3000,
        source: CONFIG_SOURCES.INCODE,
        configPath: 'config.test.value'
      });
    });

    it('should handle zero as a valid value from env var', () => {
      process.env.TEST_ENV_VAR = '0';

      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        configValue: undefined,
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: 0,
        source: CONFIG_SOURCES.ENV,
        configPath: 'config.test.value'
      });
    });

    it('should handle zero as a valid value from config', () => {
      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        configValue: 0,
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: 0,
        source: CONFIG_SOURCES.INCODE,
        configPath: 'config.test.value'
      });
    });

    it('should handle negative numbers from env var', () => {
      process.env.TEST_ENV_VAR = '-500';

      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        configValue: undefined,
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: -500,
        source: CONFIG_SOURCES.ENV,
        configPath: 'config.test.value'
      });
    });

    it('should handle negative numbers from config', () => {
      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        configValue: -500,
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: -500,
        source: CONFIG_SOURCES.INCODE,
        configPath: 'config.test.value'
      });
    });

    it('should handle floating point numbers from env var', () => {
      process.env.TEST_ENV_VAR = '123.45';

      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        configValue: undefined,
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: 123.45,
        source: CONFIG_SOURCES.ENV,
        configPath: 'config.test.value'
      });
    });

    it('should handle floating point numbers from config', () => {
      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        configValue: 123.45,
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: 123.45,
        source: CONFIG_SOURCES.INCODE,
        configPath: 'config.test.value'
      });
    });

    it('should handle null config value', () => {
      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        configValue: null,
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: 1000,
        source: CONFIG_SOURCES.DEFAULT,
        configPath: 'config.test.value'
      });
    });

    it('should handle empty string env var as 0', () => {
      process.env.TEST_ENV_VAR = '';

      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        configValue: undefined,
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: 0,
        source: CONFIG_SOURCES.ENV,
        configPath: 'config.test.value'
      });
    });

    it('should handle empty string config value as 0', () => {
      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        configValue: '',
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: 0,
        source: CONFIG_SOURCES.INCODE,
        configPath: 'config.test.value'
      });
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
        configValue: undefined,
        defaultValue: false,
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: false,
        source: CONFIG_SOURCES.DEFAULT,
        configPath: 'config.test.value'
      });
    });

    it('should prioritize env var over config value', () => {
      process.env.TEST_BOOL_VAR = 'true';

      const result = util.resolveBooleanConfig({
        envVar: 'TEST_BOOL_VAR',
        configValue: false,
        defaultValue: false,
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: true,
        source: CONFIG_SOURCES.ENV,
        configPath: 'config.test.value'
      });
    });

    it('should use config value when env var is not set', () => {
      const result = util.resolveBooleanConfig({
        envVar: 'TEST_BOOL_VAR',
        configValue: true,
        defaultValue: false,
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: true,
        source: CONFIG_SOURCES.INCODE,
        configPath: 'config.test.value'
      });
    });

    it('should parse "true" from env var', () => {
      process.env.TEST_BOOL_VAR = 'true';

      const result = util.resolveBooleanConfig({
        envVar: 'TEST_BOOL_VAR',
        configValue: undefined,
        defaultValue: false,
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: true,
        source: CONFIG_SOURCES.ENV,
        configPath: 'config.test.value'
      });
    });

    it('should parse "false" from env var', () => {
      process.env.TEST_BOOL_VAR = 'false';

      const result = util.resolveBooleanConfig({
        envVar: 'TEST_BOOL_VAR',
        configValue: undefined,
        defaultValue: true,
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: false,
        source: CONFIG_SOURCES.ENV,
        configPath: 'config.test.value'
      });
    });

    it('should parse "1" from env var as true', () => {
      process.env.TEST_BOOL_VAR = '1';

      const result = util.resolveBooleanConfig({
        envVar: 'TEST_BOOL_VAR',
        configValue: undefined,
        defaultValue: false
      });

      expect(result).to.deep.equal({
        value: true,
        source: CONFIG_SOURCES.ENV,
        configPath: undefined
      });
    });

    it('should parse "0" from env var as false', () => {
      process.env.TEST_BOOL_VAR = '0';

      const result = util.resolveBooleanConfig({
        envVar: 'TEST_BOOL_VAR',
        configValue: undefined,
        defaultValue: true,
        configPath: 'config.test.value'
      });
      expect(result).to.deep.equal({
        value: false,
        source: CONFIG_SOURCES.ENV,
        configPath: 'config.test.value'
      });
    });

    it('should handle case-insensitive "TRUE" from env var', () => {
      process.env.TEST_BOOL_VAR = 'TRUE';

      const result = util.resolveBooleanConfig({
        envVar: 'TEST_BOOL_VAR',
        configValue: undefined,
        defaultValue: false,
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: true,
        source: CONFIG_SOURCES.ENV,
        configPath: 'config.test.value'
      });
    });

    it('should handle case-insensitive "FALSE" from env var', () => {
      process.env.TEST_BOOL_VAR = 'FALSE';

      const result = util.resolveBooleanConfig({
        envVar: 'TEST_BOOL_VAR',
        configValue: undefined,
        defaultValue: true,
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: false,
        source: CONFIG_SOURCES.ENV,
        configPath: 'config.test.value'
      });
    });

    it('should fall back to config value when env var is invalid', () => {
      process.env.TEST_BOOL_VAR = 'invalid';

      const result = util.resolveBooleanConfig({
        envVar: 'TEST_BOOL_VAR',
        configValue: true,
        defaultValue: false,
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: true,
        source: CONFIG_SOURCES.INCODE,
        configPath: 'config.test.value'
      });
    });

    it('should fall back to default when both env var and config value are invalid', () => {
      process.env.TEST_BOOL_VAR = 'invalid';

      const result = util.resolveBooleanConfig({
        envVar: 'TEST_BOOL_VAR',
        configValue: 'not-a-boolean',
        defaultValue: true,
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: true,
        source: CONFIG_SOURCES.DEFAULT,
        configPath: 'config.test.value'
      });
    });

    it('should handle null config value', () => {
      const result = util.resolveBooleanConfig({
        envVar: 'TEST_BOOL_VAR',
        configValue: null,
        defaultValue: true,
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: true,
        source: CONFIG_SOURCES.DEFAULT,
        configPath: 'config.test.value'
      });
    });

    it('should handle undefined config value', () => {
      const result = util.resolveBooleanConfig({
        envVar: 'TEST_BOOL_VAR',
        configValue: undefined,
        defaultValue: false,
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: false,
        source: CONFIG_SOURCES.DEFAULT,
        configPath: 'config.test.value'
      });
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
        configValue: undefined,
        defaultValue: true,
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: false,
        source: CONFIG_SOURCES.ENV,
        configPath: 'config.test.value'
      });
    });

    it('should prioritize env var over config value', () => {
      process.env.TEST_DISABLE_VAR = 'true';

      const result = util.resolveBooleanConfigWithInvertedEnv({
        envVar: 'TEST_DISABLE_VAR',
        configValue: true,
        defaultValue: true,
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: false,
        source: CONFIG_SOURCES.ENV,
        configPath: 'config.test.value'
      });
    });

    it('should use config value when env var is not set', () => {
      const result = util.resolveBooleanConfigWithInvertedEnv({
        envVar: 'TEST_DISABLE_VAR',
        configValue: false,
        defaultValue: true,
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: false,
        source: CONFIG_SOURCES.INCODE,
        configPath: 'config.test.value'
      });
    });

    it('should use default when env var is not "true" and config is not set', () => {
      process.env.TEST_DISABLE_VAR = 'false';

      const result = util.resolveBooleanConfigWithInvertedEnv({
        envVar: 'TEST_DISABLE_VAR',
        configValue: undefined,
        defaultValue: true,
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: true,
        source: CONFIG_SOURCES.ENV,
        configPath: 'config.test.value'
      });
    });

    it('should handle null config value', () => {
      const result = util.resolveBooleanConfigWithInvertedEnv({
        envVar: 'TEST_DISABLE_VAR',
        configValue: null,
        defaultValue: false,
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: false,
        source: CONFIG_SOURCES.DEFAULT,
        configPath: 'config.test.value'
      });
    });

    it('should return default when configValue and env var are not boolean', () => {
      const result = util.resolveBooleanConfigWithInvertedEnv({
        envVar: 'TEST_INVERTED_VAR',
        configValue: 'not-a-boolean',
        defaultValue: true,
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: true,
        source: CONFIG_SOURCES.DEFAULT,
        configPath: 'config.test.value'
      });
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
        configValue: undefined,
        defaultValue: false,
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: true,
        source: CONFIG_SOURCES.ENV,
        configPath: 'config.test.value'
      });
    });

    it('should return true when env var is "true"', () => {
      process.env.TEST_TRUTHY_VAR = 'true';

      const result = util.resolveBooleanConfigWithTruthyEnv({
        envVar: 'TEST_TRUTHY_VAR',
        configValue: undefined,
        defaultValue: false,
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: true,
        source: CONFIG_SOURCES.ENV,
        configPath: 'config.test.value'
      });
    });

    it('should return true when env var is "1"', () => {
      process.env.TEST_TRUTHY_VAR = '1';

      const result = util.resolveBooleanConfigWithTruthyEnv({
        envVar: 'TEST_TRUTHY_VAR',
        configValue: undefined,
        defaultValue: false,
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: true,
        source: CONFIG_SOURCES.ENV,
        configPath: 'config.test.value'
      });
    });

    it('should prioritize env var over config value', () => {
      process.env.TEST_TRUTHY_VAR = 'yes';

      const result = util.resolveBooleanConfigWithTruthyEnv({
        envVar: 'TEST_TRUTHY_VAR',
        configValue: false,
        defaultValue: false,
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: true,
        source: CONFIG_SOURCES.ENV,
        configPath: 'config.test.value'
      });
    });

    it('should use config value when env var is not set', () => {
      const result = util.resolveBooleanConfigWithTruthyEnv({
        envVar: 'TEST_TRUTHY_VAR',
        configValue: true,
        defaultValue: false,
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: true,
        source: CONFIG_SOURCES.INCODE,
        configPath: 'config.test.value'
      });
    });

    it('should use default when env var is not set and config is not boolean', () => {
      const result = util.resolveBooleanConfigWithTruthyEnv({
        envVar: 'TEST_TRUTHY_VAR',
        configValue: undefined,
        defaultValue: false,
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: false,
        source: CONFIG_SOURCES.DEFAULT,
        configPath: 'config.test.value'
      });
    });

    it('should handle empty string env var as falsy', () => {
      process.env.TEST_TRUTHY_VAR = '';

      const result = util.resolveBooleanConfigWithTruthyEnv({
        envVar: 'TEST_TRUTHY_VAR',
        configValue: undefined,
        defaultValue: false,
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: false,
        source: CONFIG_SOURCES.DEFAULT,
        configPath: 'config.test.value'
      });
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
        configValue: undefined,
        defaultValue: 'default-value',
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: 'default-value',
        source: CONFIG_SOURCES.DEFAULT,
        configPath: 'config.test.value'
      });
    });

    it('should prioritize env var over config value', () => {
      process.env.TEST_STRING_VAR = 'env-value';

      const result = util.resolveStringConfig({
        envVar: 'TEST_STRING_VAR',
        configValue: 'config-value',
        defaultValue: 'default-value',
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: 'env-value',
        source: CONFIG_SOURCES.ENV,
        configPath: 'config.test.value'
      });
    });

    it('should use env var when config value is not set', () => {
      process.env.TEST_STRING_VAR = 'env-value';

      const result = util.resolveStringConfig({
        envVar: 'TEST_STRING_VAR',
        configValue: undefined,
        defaultValue: 'default-value',
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: 'env-value',
        source: CONFIG_SOURCES.ENV,
        configPath: 'config.test.value'
      });
    });

    it('should use config value when env var is not set', () => {
      const result = util.resolveStringConfig({
        envVar: 'TEST_STRING_VAR',
        configValue: 'config-value',
        defaultValue: 'default-value',
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: 'config-value',
        source: CONFIG_SOURCES.INCODE,
        configPath: 'config.test.value'
      });
    });

    it('should handle empty string as a valid config value', () => {
      const result = util.resolveStringConfig({
        envVar: 'TEST_STRING_VAR',
        configValue: '',
        defaultValue: 'default-value',
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: '',
        source: CONFIG_SOURCES.INCODE,
        configPath: 'config.test.value'
      });
    });

    it('should handle empty string as a valid env var value', () => {
      process.env.TEST_STRING_VAR = '';

      const result = util.resolveStringConfig({
        envVar: 'TEST_STRING_VAR',
        configValue: undefined,
        defaultValue: 'default-value',
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: '',
        source: CONFIG_SOURCES.ENV,
        configPath: 'config.test.value'
      });
    });

    it('should handle undefined config value as not set', () => {
      process.env.TEST_STRING_VAR = 'env-value';

      const result = util.resolveStringConfig({
        envVar: 'TEST_STRING_VAR',
        configValue: undefined,
        defaultValue: 'default-value',
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: 'env-value',
        source: CONFIG_SOURCES.ENV,
        configPath: 'config.test.value'
      });
    });

    it('should handle multiline string values', () => {
      const multilineValue = 'line1\nline2\nline3';
      const result = util.resolveStringConfig({
        envVar: undefined,
        configValue: multilineValue,
        defaultValue: 'default-value',
        configPath: 'config.test.value'
      });

      expect(result).to.deep.equal({
        value: multilineValue,
        source: CONFIG_SOURCES.INCODE,
        configPath: 'config.test.value'
      });
    });
  });
});
