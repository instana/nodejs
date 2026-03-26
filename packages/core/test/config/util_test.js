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
        configValue: undefined,
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.equal(1000);
    });

    it('should prioritize env var over config value', () => {
      process.env.TEST_ENV_VAR = '2000';

      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        configValue: 3000,
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.equal(2000);
    });

    it('should use config value when env var is not set', () => {
      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        configValue: 3000,
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.equal(3000);
    });

    it('should handle numeric config value', () => {
      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        configValue: 5000,
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.equal(5000);
    });

    it('should handle string config value that can be parsed as number', () => {
      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        configValue: '5000',
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.equal(5000);
    });

    it('should handle string env var that can be parsed as number', () => {
      process.env.TEST_ENV_VAR = '7500';

      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        configValue: undefined,
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.equal(7500);
    });

    it('should fall back to default when env var is invalid', () => {
      process.env.TEST_ENV_VAR = 'not-a-number';

      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        configValue: undefined,
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.equal(1000);
    });

    it('should fall back to default when config value is invalid', () => {
      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        configValue: 'invalid',
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.equal(1000);
    });

    it('should use config value when env var is invalid', () => {
      process.env.TEST_ENV_VAR = 'not-a-number';

      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        configValue: 3000,
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.equal(3000);
    });

    it('should handle zero as a valid value from env var', () => {
      process.env.TEST_ENV_VAR = '0';

      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        configValue: undefined,
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.equal(0);
    });

    it('should handle zero as a valid value from config', () => {
      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        configValue: 0,
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.equal(0);
    });

    it('should handle negative numbers from env var', () => {
      process.env.TEST_ENV_VAR = '-500';

      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        configValue: undefined,
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.equal(-500);
    });

    it('should handle negative numbers from config', () => {
      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        configValue: -500,
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.equal(-500);
    });

    it('should handle floating point numbers from env var', () => {
      process.env.TEST_ENV_VAR = '123.45';

      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        configValue: undefined,
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.equal(123.45);
    });

    it('should handle floating point numbers from config', () => {
      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        configValue: 123.45,
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.equal(123.45);
    });

    it('should handle null config value', () => {
      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        configValue: null,
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.equal(1000);
    });

    it('should handle empty string env var as 0', () => {
      process.env.TEST_ENV_VAR = '';

      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        configValue: undefined,
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.equal(0);
    });

    it('should handle empty string config value as 0', () => {
      const result = util.resolveNumericConfig({
        envVar: 'TEST_ENV_VAR',
        configValue: '',
        defaultValue: 1000,
        configPath: 'config.test.value'
      });

      expect(result).to.equal(0);
    });
  });
});
