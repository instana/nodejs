/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const expect = require('chai').expect;
const { createFakeLogger } = require('../test_util');
const util = require('../../src/config/util');
const validate = require('../../src/config/validator');
const { CONFIG_SOURCES } = require('../../src/util/constants');

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
    delete process.env.TEST_BOOL_VAR;
    delete process.env.TEST_STRING_VAR;
    delete process.env.TEST_TRUTHY_VAR;
  }

  describe('resolve - priority order (env > inCode > agent > default)', () => {
    it('should prioritize env over inCode, agent, and default', () => {
      process.env.TEST_ENV_VAR = '100';

      const result = util.resolve(
        {
          envValue: 'TEST_ENV_VAR',
          inCodeValue: 200,
          agentValue: 300,
          defaultValue: 400
        },
        validate.numberValidator
      );

      expect(result).to.deep.equal({
        value: 100,
        source: CONFIG_SOURCES.ENV
      });
    });

    it('should prioritize inCode over agent and default when env is not set', () => {
      const result = util.resolve(
        {
          inCodeValue: 200,
          agentValue: 300,
          defaultValue: 400
        },
        validate.numberValidator
      );

      expect(result).to.deep.equal({
        value: 200,
        source: CONFIG_SOURCES.INCODE
      });
    });

    it('should prioritize agent over default when env and inCode are not set', () => {
      const result = util.resolve(
        {
          agentValue: 300,
          defaultValue: 400
        },
        validate.numberValidator
      );

      expect(result).to.deep.equal({
        value: 300,
        source: CONFIG_SOURCES.AGENT
      });
    });

    it('should use default when env, inCode, and agent are not set', () => {
      const result = util.resolve(
        {
          defaultValue: 400
        },
        validate.numberValidator
      );

      expect(result).to.deep.equal({
        value: 400,
        source: CONFIG_SOURCES.DEFAULT
      });
    });
  });

  describe('resolve with numberValidator', () => {
    it('should parse numeric string from env var', () => {
      process.env.TEST_ENV_VAR = '7500';

      const result = util.resolve(
        {
          envValue: 'TEST_ENV_VAR',
          inCodeValue: undefined,
          defaultValue: 1000
        },
        validate.numberValidator
      );

      expect(result).to.deep.equal({
        value: 7500,
        source: CONFIG_SOURCES.ENV
      });
    });

    it('should parse numeric string from inCode value', () => {
      const result = util.resolve(
        {
          envValue: 'TEST_ENV_VAR',
          inCodeValue: '5000',
          defaultValue: 1000
        },
        validate.numberValidator
      );

      expect(result).to.deep.equal({
        value: 5000,
        source: CONFIG_SOURCES.INCODE
      });
    });

    it('should handle zero as valid value', () => {
      const result = util.resolve(
        {
          envValue: 'TEST_ENV_VAR',
          inCodeValue: 0,
          defaultValue: 1000
        },
        validate.numberValidator
      );

      expect(result).to.deep.equal({
        value: 0,
        source: CONFIG_SOURCES.INCODE
      });
    });

    it('should handle negative numbers', () => {
      process.env.TEST_ENV_VAR = '-500';

      const result = util.resolve(
        {
          envValue: 'TEST_ENV_VAR',
          inCodeValue: undefined,
          defaultValue: 1000
        },
        validate.numberValidator
      );

      expect(result).to.deep.equal({
        value: -500,
        source: CONFIG_SOURCES.ENV
      });
    });

    it('should handle floating point numbers', () => {
      const result = util.resolve(
        {
          envValue: 'TEST_ENV_VAR',
          inCodeValue: 123.45,
          defaultValue: 1000
        },
        validate.numberValidator
      );

      expect(result).to.deep.equal({
        value: 123.45,
        source: CONFIG_SOURCES.INCODE
      });
    });

    it('should handle empty string as 0', () => {
      process.env.TEST_ENV_VAR = '';

      const result = util.resolve(
        {
          envValue: 'TEST_ENV_VAR',
          inCodeValue: undefined,
          defaultValue: 1000
        },
        validate.numberValidator
      );

      expect(result).to.deep.equal({
        value: 0,
        source: CONFIG_SOURCES.ENV
      });
    });

    it('should fall back to next priority when env var is invalid', () => {
      process.env.TEST_ENV_VAR = 'not-a-number';

      const result = util.resolve(
        {
          envValue: 'TEST_ENV_VAR',
          inCodeValue: 3000,
          defaultValue: 1000
        },
        validate.numberValidator
      );

      expect(result).to.deep.equal({
        value: 3000,
        source: CONFIG_SOURCES.INCODE
      });
    });

    it('should fall back to default when all values are invalid', () => {
      process.env.TEST_ENV_VAR = 'not-a-number';

      const result = util.resolve(
        {
          envValue: 'TEST_ENV_VAR',
          inCodeValue: 'invalid',
          defaultValue: 1000
        },
        validate.numberValidator
      );

      expect(result).to.deep.equal({
        value: 1000,
        source: CONFIG_SOURCES.DEFAULT
      });
    });

    it('should treat null as undefined', () => {
      const result = util.resolve(
        {
          envValue: 'TEST_ENV_VAR',
          inCodeValue: null,
          defaultValue: 1000
        },
        validate.numberValidator
      );

      expect(result).to.deep.equal({
        value: 1000,
        source: CONFIG_SOURCES.DEFAULT
      });
    });
  });

  describe('resolve with booleanValidator', () => {
    it('should parse "true" from env var', () => {
      process.env.TEST_BOOL_VAR = 'true';

      const result = util.resolve(
        {
          envValue: 'TEST_BOOL_VAR',
          inCodeValue: undefined,
          defaultValue: false
        },
        validate.booleanValidator
      );

      expect(result).to.deep.equal({
        value: true,
        source: CONFIG_SOURCES.ENV
      });
    });

    it('should parse "false" from env var', () => {
      process.env.TEST_BOOL_VAR = 'false';

      const result = util.resolve(
        {
          envValue: 'TEST_BOOL_VAR',
          inCodeValue: undefined,
          defaultValue: true
        },
        validate.booleanValidator
      );

      expect(result).to.deep.equal({
        value: false,
        source: CONFIG_SOURCES.ENV
      });
    });

    it('should parse "1" as true', () => {
      process.env.TEST_BOOL_VAR = '1';

      const result = util.resolve(
        {
          envValue: 'TEST_BOOL_VAR',
          inCodeValue: undefined,
          defaultValue: false
        },
        validate.booleanValidator
      );

      expect(result).to.deep.equal({
        value: true,
        source: CONFIG_SOURCES.ENV
      });
    });

    it('should parse "0" as false', () => {
      process.env.TEST_BOOL_VAR = '0';

      const result = util.resolve(
        {
          envValue: 'TEST_BOOL_VAR',
          inCodeValue: undefined,
          defaultValue: true
        },
        validate.booleanValidator
      );

      expect(result).to.deep.equal({
        value: false,
        source: CONFIG_SOURCES.ENV
      });
    });

    it('should handle case-insensitive values', () => {
      process.env.TEST_BOOL_VAR = 'TRUE';

      const result = util.resolve(
        {
          envValue: 'TEST_BOOL_VAR',
          inCodeValue: undefined,
          defaultValue: false
        },
        validate.booleanValidator
      );

      expect(result).to.deep.equal({
        value: true,
        source: CONFIG_SOURCES.ENV
      });
    });

    it('should handle boolean inCode values', () => {
      const result = util.resolve(
        {
          envValue: 'TEST_BOOL_VAR',
          inCodeValue: true,
          defaultValue: false
        },
        validate.booleanValidator
      );

      expect(result).to.deep.equal({
        value: true,
        source: CONFIG_SOURCES.INCODE
      });
    });

    it('should fall back to next priority when env var is invalid', () => {
      process.env.TEST_BOOL_VAR = 'invalid';

      const result = util.resolve(
        {
          envValue: 'TEST_BOOL_VAR',
          inCodeValue: true,
          defaultValue: false
        },
        validate.booleanValidator
      );

      expect(result).to.deep.equal({
        value: true,
        source: CONFIG_SOURCES.INCODE
      });
    });

    it('should fall back to default when all values are invalid', () => {
      process.env.TEST_BOOL_VAR = 'invalid';

      const result = util.resolve(
        {
          envValue: 'TEST_BOOL_VAR',
          inCodeValue: 'not-a-boolean',
          defaultValue: true
        },
        validate.booleanValidator
      );

      expect(result).to.deep.equal({
        value: true,
        source: CONFIG_SOURCES.DEFAULT
      });
    });
  });

  describe('resolve with validateTruthyBoolean', () => {
    it('should return true for any truthy env var value', () => {
      process.env.TEST_TRUTHY_VAR = 'any-value';

      const result = util.resolve(
        {
          envValue: 'TEST_TRUTHY_VAR',
          inCodeValue: undefined,
          defaultValue: false
        },
        validate.validateTruthyBoolean
      );

      expect(result).to.deep.equal({
        value: true,
        source: CONFIG_SOURCES.ENV
      });
    });

    it('should return true for truthy inCode value', () => {
      const result = util.resolve(
        {
          envValue: 'TEST_TRUTHY_VAR',
          inCodeValue: true,
          defaultValue: false
        },
        validate.validateTruthyBoolean
      );

      expect(result).to.deep.equal({
        value: true,
        source: CONFIG_SOURCES.INCODE
      });
    });

    it('should fall back to default for empty string env var', () => {
      process.env.TEST_TRUTHY_VAR = '';

      const result = util.resolve(
        {
          envValue: 'TEST_TRUTHY_VAR',
          inCodeValue: undefined,
          defaultValue: false
        },
        validate.validateTruthyBoolean
      );

      expect(result).to.deep.equal({
        value: false,
        source: CONFIG_SOURCES.DEFAULT
      });
    });

    it('should fall back to default for falsy inCode value', () => {
      const result = util.resolve(
        {
          envValue: 'TEST_TRUTHY_VAR',
          inCodeValue: false,
          defaultValue: true
        },
        validate.validateTruthyBoolean
      );

      expect(result).to.deep.equal({
        value: true,
        source: CONFIG_SOURCES.DEFAULT
      });
    });
  });

  describe('resolve with stringValidator', () => {
    it('should use string from env var', () => {
      process.env.TEST_STRING_VAR = 'env-value';

      const result = util.resolve(
        {
          envValue: 'TEST_STRING_VAR',
          inCodeValue: undefined,
          defaultValue: 'default-value'
        },
        validate.stringValidator
      );

      expect(result).to.deep.equal({
        value: 'env-value',
        source: CONFIG_SOURCES.ENV
      });
    });

    it('should use string from inCode value', () => {
      const result = util.resolve(
        {
          envValue: 'TEST_STRING_VAR',
          inCodeValue: 'config-value',
          defaultValue: 'default-value'
        },
        validate.stringValidator
      );

      expect(result).to.deep.equal({
        value: 'config-value',
        source: CONFIG_SOURCES.INCODE
      });
    });

    it('should handle empty string as valid value', () => {
      process.env.TEST_STRING_VAR = '';

      const result = util.resolve(
        {
          envValue: 'TEST_STRING_VAR',
          inCodeValue: undefined,
          defaultValue: 'default-value'
        },
        validate.stringValidator
      );

      expect(result).to.deep.equal({
        value: '',
        source: CONFIG_SOURCES.ENV
      });
    });

    it('should handle multiline strings', () => {
      const multilineValue = 'line1\nline2\nline3';
      const result = util.resolve(
        {
          envValue: 'TEST_STRING_VAR',
          inCodeValue: multilineValue,
          defaultValue: 'default-value'
        },
        validate.stringValidator
      );

      expect(result).to.deep.equal({
        value: multilineValue,
        source: CONFIG_SOURCES.INCODE
      });
    });

    it('should reject non-string values and fall back', () => {
      const result = util.resolve(
        {
          envValue: 'TEST_STRING_VAR',
          inCodeValue: 123,
          defaultValue: 'default-value'
        },
        validate.stringValidator
      );

      expect(result).to.deep.equal({
        value: 'default-value',
        source: CONFIG_SOURCES.DEFAULT
      });
    });

    it('should treat null as undefined', () => {
      const result = util.resolve(
        {
          envValue: 'TEST_STRING_VAR',
          inCodeValue: null,
          defaultValue: 'default-value'
        },
        validate.stringValidator
      );

      expect(result).to.deep.equal({
        value: 'default-value',
        source: CONFIG_SOURCES.DEFAULT
      });
    });
  });

  describe('resolve with multiple validators', () => {
    it('should apply validators in sequence', () => {
      const customValidator = value => {
        if (typeof value === 'number' && value > 100) {
          return value;
        }
        return undefined;
      };

      const result = util.resolve(
        {
          envValue: 'TEST_ENV_VAR',
          inCodeValue: 150,
          defaultValue: 50
        },
        [validate.numberValidator, customValidator]
      );

      expect(result).to.deep.equal({
        value: 150,
        source: CONFIG_SOURCES.INCODE
      });
    });

    it('should fall back when any validator in chain fails', () => {
      const customValidator = value => {
        if (typeof value === 'number' && value > 100) {
          return value;
        }
        return undefined;
      };

      const result = util.resolve(
        {
          envValue: 'TEST_ENV_VAR',
          inCodeValue: 50,
          defaultValue: 200
        },
        [validate.numberValidator, customValidator]
      );

      expect(result).to.deep.equal({
        value: 200,
        source: CONFIG_SOURCES.DEFAULT
      });
    });
  });
});
