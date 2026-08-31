/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const expect = require('chai').expect;
const validator = require('../../src/config/validator');

describe('config.validator', () => {
  describe('numberValidator', () => {
    it('should return number for valid numeric input', () => {
      expect(validator.numberValidator(123)).to.equal(123);
      expect(validator.numberValidator(0)).to.equal(0);
      expect(validator.numberValidator(-456)).to.equal(-456);
      expect(validator.numberValidator(123.45)).to.equal(123.45);
    });

    it('should parse numeric strings', () => {
      expect(validator.numberValidator('123')).to.equal(123);
      expect(validator.numberValidator('0')).to.equal(0);
      expect(validator.numberValidator('-456')).to.equal(-456);
      expect(validator.numberValidator('123.45')).to.equal(123.45);
    });

    it('should handle empty string as 0', () => {
      expect(validator.numberValidator('')).to.equal(0);
    });

    it('should return undefined for null', () => {
      expect(validator.numberValidator(null)).to.be.undefined;
    });

    it('should return undefined for undefined', () => {
      expect(validator.numberValidator(undefined)).to.be.undefined;
    });

    it('should return undefined for non-numeric strings', () => {
      expect(validator.numberValidator('abc')).to.be.undefined;
      expect(validator.numberValidator('12abc')).to.be.undefined;
      expect(validator.numberValidator('not-a-number')).to.be.undefined;
    });

    it('should return undefined for NaN', () => {
      expect(validator.numberValidator(NaN)).to.be.undefined;
    });

    it('should handle Infinity', () => {
      expect(validator.numberValidator(Infinity)).to.equal(Infinity);
      expect(validator.numberValidator(-Infinity)).to.equal(-Infinity);
    });
  });

  describe('booleanValidator', () => {
    it('should return boolean for valid boolean input', () => {
      expect(validator.booleanValidator(true)).to.equal(true);
      expect(validator.booleanValidator(false)).to.equal(false);
    });

    it('should parse "true" string as true', () => {
      expect(validator.booleanValidator('true')).to.equal(true);
      expect(validator.booleanValidator('TRUE')).to.equal(true);
      expect(validator.booleanValidator('True')).to.equal(true);
    });

    it('should parse "false" string as false', () => {
      expect(validator.booleanValidator('false')).to.equal(false);
      expect(validator.booleanValidator('FALSE')).to.equal(false);
      expect(validator.booleanValidator('False')).to.equal(false);
    });

    it('should parse "1" as true', () => {
      expect(validator.booleanValidator('1')).to.equal(true);
    });

    it('should parse "0" as false', () => {
      expect(validator.booleanValidator('0')).to.equal(false);
    });

    it('should return undefined for null', () => {
      expect(validator.booleanValidator(null)).to.be.undefined;
    });

    it('should return undefined for undefined', () => {
      expect(validator.booleanValidator(undefined)).to.be.undefined;
    });

    it('should return undefined for invalid strings', () => {
      expect(validator.booleanValidator('yes')).to.be.undefined;
      expect(validator.booleanValidator('no')).to.be.undefined;
      expect(validator.booleanValidator('invalid')).to.be.undefined;
      expect(validator.booleanValidator('')).to.be.undefined;
    });

    it('should return undefined for numbers other than 0 and 1', () => {
      expect(validator.booleanValidator(2)).to.be.undefined;
      expect(validator.booleanValidator(-1)).to.be.undefined;
      expect(validator.booleanValidator(123)).to.be.undefined;
    });

    it('should return undefined for objects', () => {
      expect(validator.booleanValidator({})).to.be.undefined;
      expect(validator.booleanValidator([])).to.be.undefined;
    });
  });

  describe('stringValidator', () => {
    it('should return string for valid string input', () => {
      expect(validator.stringValidator('hello')).to.equal('hello');
      expect(validator.stringValidator('world')).to.equal('world');
      expect(validator.stringValidator('')).to.equal('');
    });

    it('should handle empty string', () => {
      expect(validator.stringValidator('')).to.equal('');
    });

    it('should handle multiline strings', () => {
      const multiline = 'line1\nline2\nline3';
      expect(validator.stringValidator(multiline)).to.equal(multiline);
    });

    it('should handle strings with special characters', () => {
      expect(validator.stringValidator('hello@world.com')).to.equal('hello@world.com');
      expect(validator.stringValidator('path/to/file')).to.equal('path/to/file');
      expect(validator.stringValidator('key=value')).to.equal('key=value');
    });

    it('should return undefined for null', () => {
      expect(validator.stringValidator(null)).to.be.undefined;
    });

    it('should return undefined for undefined', () => {
      expect(validator.stringValidator(undefined)).to.be.undefined;
    });

    it('should return undefined for numbers', () => {
      expect(validator.stringValidator(123)).to.be.undefined;
      expect(validator.stringValidator(0)).to.be.undefined;
      expect(validator.stringValidator(-456)).to.be.undefined;
    });

    it('should return undefined for booleans', () => {
      expect(validator.stringValidator(true)).to.be.undefined;
      expect(validator.stringValidator(false)).to.be.undefined;
    });

    it('should return undefined for objects', () => {
      expect(validator.stringValidator({})).to.be.undefined;
      expect(validator.stringValidator([])).to.be.undefined;
    });
  });

  describe('validateTruthyBoolean', () => {
    it('should return true for truthy values', () => {
      expect(validator.validateTruthyBoolean(true)).to.equal(true);
      expect(validator.validateTruthyBoolean(1)).to.equal(true);
      expect(validator.validateTruthyBoolean('any-string')).to.equal(true);
      expect(validator.validateTruthyBoolean('true')).to.equal(true);
      expect(validator.validateTruthyBoolean('false')).to.equal(true);
      expect(validator.validateTruthyBoolean({})).to.equal(true);
      expect(validator.validateTruthyBoolean([])).to.equal(true);
      expect(validator.validateTruthyBoolean(123)).to.equal(true);
    });

    it('should return undefined for falsy values', () => {
      expect(validator.validateTruthyBoolean(false)).to.be.undefined;
      expect(validator.validateTruthyBoolean(0)).to.be.undefined;
      expect(validator.validateTruthyBoolean('')).to.be.undefined;
      expect(validator.validateTruthyBoolean(null)).to.be.undefined;
      expect(validator.validateTruthyBoolean(undefined)).to.be.undefined;
      expect(validator.validateTruthyBoolean(NaN)).to.be.undefined;
    });
  });

  describe('config.validator.validator', () => {
    describe('validateStackTraceMode', () => {
      it('should validator "all" as valid', () => {
        const result = validator.validateStackTraceMode('all');
        expect(result.isValid).to.be.true;
        expect(result.error).to.be.null;
      });

      it('should validator "error" as valid', () => {
        const result = validator.validateStackTraceMode('error');
        expect(result.isValid).to.be.true;
        expect(result.error).to.be.null;
      });

      it('should validator "none" as valid', () => {
        const result = validator.validateStackTraceMode('none');
        expect(result.isValid).to.be.true;
        expect(result.error).to.be.null;
      });

      it('should validator uppercase "ALL" as valid', () => {
        const result = validator.validateStackTraceMode('ALL');
        expect(result.isValid).to.be.true;
        expect(result.error).to.be.null;
      });

      it('should validator mixed case "ErRoR" as valid', () => {
        const result = validator.validateStackTraceMode('ErRoR');
        expect(result.isValid).to.be.true;
        expect(result.error).to.be.null;
      });

      it('should validator mixed case "NoNe" as valid', () => {
        const result = validator.validateStackTraceMode('NoNe');
        expect(result.isValid).to.be.true;
        expect(result.error).to.be.null;
      });

      it('should reject null value', () => {
        const result = validator.validateStackTraceMode(null);
        expect(result.isValid).to.be.false;
        expect(result.error).to.include('cannot be null');
      });

      it('should reject invalid string value', () => {
        const result = validator.validateStackTraceMode('invalid');
        expect(result.isValid).to.be.false;
        expect(result.error).to.include('Invalid value: "invalid"');
      });

      it('should reject number type', () => {
        const result = validator.validateStackTraceMode(123);
        expect(result.isValid).to.be.false;
        expect(result.error).to.include('non-supported type number');
      });

      it('should reject boolean type', () => {
        const result = validator.validateStackTraceMode(true);
        expect(result.isValid).to.be.false;
        expect(result.error).to.include('non-supported type boolean');
      });

      it('should reject object type', () => {
        const result = validator.validateStackTraceMode({});
        expect(result.isValid).to.be.false;
        expect(result.error).to.include('non-supported type object');
      });

      it('should reject array type', () => {
        const result = validator.validateStackTraceMode(['error']);
        expect(result.isValid).to.be.false;
        expect(result.error).to.include('non-supported type object');
      });

      it('should reject undefined value', () => {
        const result = validator.validateStackTraceMode(undefined);
        expect(result.isValid).to.be.false;
        expect(result.error).to.include('non-supported type undefined');
      });

      it('should reject empty string', () => {
        const result = validator.validateStackTraceMode('');
        expect(result.isValid).to.be.false;
        expect(result.error).to.include('Invalid value: ""');
      });

      it('should reject string with only whitespace', () => {
        const result = validator.validateStackTraceMode('   ');
        expect(result.isValid).to.be.false;
        expect(result.error).to.include('Invalid value');
      });
    });

    describe('validateStackTraceLength', () => {
      it('should validator positive number', () => {
        const result = validator.validateStackTraceLength(10);
        expect(result.isValid).to.be.true;
        expect(result.error).to.be.null;
      });

      it('should validator zero', () => {
        const result = validator.validateStackTraceLength(0);
        expect(result.isValid).to.be.true;
        expect(result.error).to.be.null;
      });

      it('should validator negative number', () => {
        const result = validator.validateStackTraceLength(-10);
        expect(result.isValid).to.be.true;
        expect(result.error).to.be.null;
      });

      it('should validator large number', () => {
        const result = validator.validateStackTraceLength(1000);
        expect(result.isValid).to.be.true;
        expect(result.error).to.be.null;
      });

      it('should validator decimal number', () => {
        const result = validator.validateStackTraceLength(15.7);
        expect(result.isValid).to.be.true;
        expect(result.error).to.be.null;
      });

      it('should validator numeric string', () => {
        const result = validator.validateStackTraceLength('20');
        expect(result.isValid).to.be.true;
        expect(result.error).to.be.null;
      });

      it('should validator negative numeric string', () => {
        const result = validator.validateStackTraceLength('-15');
        expect(result.isValid).to.be.true;
        expect(result.error).to.be.null;
      });

      it('should validator decimal numeric string', () => {
        const result = validator.validateStackTraceLength('12.5');
        expect(result.isValid).to.be.true;
        expect(result.error).to.be.null;
      });

      it('should validator numeric string with leading zeros', () => {
        const result = validator.validateStackTraceLength('007');
        expect(result.isValid).to.be.true;
        expect(result.error).to.be.null;
      });

      it('should validator numeric string with whitespace', () => {
        const result = validator.validateStackTraceLength('  25  ');
        expect(result.isValid).to.be.true;
        expect(result.error).to.be.null;
      });

      it('should validator numeric string with plus sign', () => {
        const result = validator.validateStackTraceLength('+30');
        expect(result.isValid).to.be.true;
        expect(result.error).to.be.null;
      });

      it('should reject null value', () => {
        const result = validator.validateStackTraceLength(null);
        expect(result.isValid).to.be.false;
        expect(result.error).to.equal('The value cannot be null');
      });

      it('should reject undefined value', () => {
        const result = validator.validateStackTraceLength(undefined);
        expect(result.isValid).to.be.false;
        expect(result.error).to.equal('The value cannot be null');
      });

      it('should reject non-numeric string', () => {
        const result = validator.validateStackTraceLength('invalid');
        expect(result.isValid).to.be.false;
        expect(result.error).to.include('cannot be parsed to a numerical value');
      });

      it('should reject empty string', () => {
        const result = validator.validateStackTraceLength('');
        expect(result.isValid).to.be.false;
        expect(result.error).to.include('cannot be parsed to a numerical value');
      });

      it('should reject boolean type', () => {
        const result = validator.validateStackTraceLength(true);
        expect(result.isValid).to.be.false;
        expect(result.error).to.include('non-supported type boolean');
      });

      it('should reject object type', () => {
        const result = validator.validateStackTraceLength({});
        expect(result.isValid).to.be.false;
        expect(result.error).to.include('non-supported type object');
      });

      it('should reject array type', () => {
        const result = validator.validateStackTraceLength([10]);
        expect(result.isValid).to.be.false;
        expect(result.error).to.include('non-supported type object');
      });

      it('should reject Infinity', () => {
        const result = validator.validateStackTraceLength(Infinity);
        expect(result.isValid).to.be.false;
        expect(result.error).to.include('Invalid value: Infinity');
      });

      it('should reject -Infinity', () => {
        const result = validator.validateStackTraceLength(-Infinity);
        expect(result.isValid).to.be.false;
        expect(result.error).to.include('Invalid value: -Infinity');
      });

      it('should reject NaN', () => {
        const result = validator.validateStackTraceLength(NaN);
        expect(result.isValid).to.be.false;
        expect(result.error).to.include('Invalid value: NaN');
      });

      it('should reject string "Infinity"', () => {
        const result = validator.validateStackTraceLength('Infinity');
        expect(result.isValid).to.be.false;
        expect(result.error).to.include('cannot be parsed');
      });

      it('should reject string "NaN"', () => {
        const result = validator.validateStackTraceLength('NaN');
        expect(result.isValid).to.be.false;
        expect(result.error).to.include('cannot be parsed to a numerical value');
      });

      it('should reject function type', () => {
        const result = validator.validateStackTraceLength(() => 10);
        expect(result.isValid).to.be.false;
        expect(result.error).to.include('non-supported type function');
      });

      it('should reject symbol type', () => {
        const result = validator.validateStackTraceLength(Symbol('test'));
        expect(result.isValid).to.be.false;
        expect(result.error).to.include('non-supported type symbol');
      });
    });
  });

  describe('httpExitErrorCodeValidator', () => {
    it('should return an array for a valid comma-separated string', () => {
      expect(validator.httpExitErrorCodeValidator('401,403')).to.deep.equal([401, 403]);
    });

    it('should return an array for a valid array input', () => {
      expect(validator.httpExitErrorCodeValidator([401, 403])).to.deep.equal([401, 403]);
    });

    it('should trim whitespace around tokens', () => {
      expect(validator.httpExitErrorCodeValidator('401, 403')).to.deep.equal([401, 403]);
      expect(validator.httpExitErrorCodeValidator(' 401 , 403 ')).to.deep.equal([401, 403]);
    });

    it('should ignore non-integer tokens', () => {
      expect(validator.httpExitErrorCodeValidator('401,abc,403')).to.deep.equal([401, 403]);
      expect(validator.httpExitErrorCodeValidator([401, 'abc', 403])).to.deep.equal([401, 403]);
    });

    it('should ignore values below 400', () => {
      expect(validator.httpExitErrorCodeValidator('399,401')).to.deep.equal([401]);
      expect(validator.httpExitErrorCodeValidator([200, 301, 401])).to.deep.equal([401]);
    });

    it('should ignore values above 499', () => {
      expect(validator.httpExitErrorCodeValidator('401,500,600')).to.deep.equal([401]);
      expect(validator.httpExitErrorCodeValidator([401, 500, 503])).to.deep.equal([401]);
    });

    it('should return empty array when all values are out of range', () => {
      expect(validator.httpExitErrorCodeValidator('200,301,500')).to.deep.equal([]);
    });

    it('should return empty array for an empty comma-separated string', () => {
      expect(validator.httpExitErrorCodeValidator('')).to.deep.equal([]);
    });

    it('should return empty array for an empty array', () => {
      expect(validator.httpExitErrorCodeValidator([])).to.deep.equal([]);
    });

    it('should return undefined for null', () => {
      expect(validator.httpExitErrorCodeValidator(null)).to.be.undefined;
    });

    it('should return undefined for undefined', () => {
      expect(validator.httpExitErrorCodeValidator(undefined)).to.be.undefined;
    });

    it('should return undefined for a number', () => {
      expect(validator.httpExitErrorCodeValidator(401)).to.be.undefined;
    });

    it('should return undefined for a plain object', () => {
      expect(validator.httpExitErrorCodeValidator({ code: 401 })).to.be.undefined;
    });

    it('should preserve all valid 4xx codes including boundary values', () => {
      expect(validator.httpExitErrorCodeValidator('400,499')).to.deep.equal([400, 499]);
    });

    it('should preserve duplicate values', () => {
      expect(validator.httpExitErrorCodeValidator('401,401,403')).to.deep.equal([401, 401, 403]);
    });

    it('should trim whitespace in array values', () => {
      expect(validator.httpExitErrorCodeValidator([' 401 ', '403 '])).to.deep.equal([401, 403]);
    });

    it('should accept a mix of string and number values in an array', () => {
      expect(validator.httpExitErrorCodeValidator(['401', 403])).to.deep.equal([401, 403]);
    });

    it('should ignore empty tokens in comma-separated strings', () => {
      expect(validator.httpExitErrorCodeValidator('401,,403,')).to.deep.equal([401, 403]);
    });

    it('should ignore empty string values in arrays', () => {
      expect(validator.httpExitErrorCodeValidator(['401', '', '403'])).to.deep.equal([401, 403]);
    });

    it('should ignore decimal values', () => {
      expect(validator.httpExitErrorCodeValidator('401.5,403')).to.deep.equal([403]);
      expect(validator.httpExitErrorCodeValidator([401.5, 403])).to.deep.equal([403]);
    });

    it('should ignore boolean and null values in arrays', () => {
      expect(validator.httpExitErrorCodeValidator([401, true, null, false, 403])).to.deep.equal([401, 403]);
    });

    it('should return an empty array when all comma-separated values are invalid', () => {
      expect(validator.httpExitErrorCodeValidator('abc,,500,399')).to.deep.equal([]);
    });

    it('should return an empty array when all array values are invalid', () => {
      expect(validator.httpExitErrorCodeValidator(['abc', {}, [], 500, 399])).to.deep.equal([]);
    });
  });

  describe('logLevelValidator', () => {
    it('should return undefined for null', () => {
      expect(validator.logLevelValidator(null)).to.be.undefined;
    });

    it('should return undefined for undefined', () => {
      expect(validator.logLevelValidator(undefined)).to.be.undefined;
    });

    it('should accept "info"', () => {
      expect(validator.logLevelValidator('info')).to.equal('info');
    });

    it('should accept "warn"', () => {
      expect(validator.logLevelValidator('warn')).to.equal('warn');
    });

    it('should accept "error"', () => {
      expect(validator.logLevelValidator('error')).to.equal('error');
    });

    it('should accept "off"', () => {
      expect(validator.logLevelValidator('off')).to.equal('off');
    });

    it('should normalize mixed-case input to lowercase', () => {
      expect(validator.logLevelValidator('INFO')).to.equal('info');
      expect(validator.logLevelValidator('Warn')).to.equal('warn');
      expect(validator.logLevelValidator('ERROR')).to.equal('error');
      expect(validator.logLevelValidator('OFF')).to.equal('off');
    });

    it('should return undefined for an invalid string value', () => {
      expect(validator.logLevelValidator('debug')).to.be.undefined;
      expect(validator.logLevelValidator('verbose')).to.be.undefined;
      expect(validator.logLevelValidator('trace')).to.be.undefined;
      expect(validator.logLevelValidator('INVALID')).to.be.undefined;
    });

    it('should return undefined for a number', () => {
      expect(validator.logLevelValidator(1)).to.be.undefined;
      expect(validator.logLevelValidator(0)).to.be.undefined;
    });

    it('should return undefined for a boolean', () => {
      expect(validator.logLevelValidator(true)).to.be.undefined;
      expect(validator.logLevelValidator(false)).to.be.undefined;
    });

    it('should return undefined for an object', () => {
      expect(validator.logLevelValidator({})).to.be.undefined;
      expect(validator.logLevelValidator([])).to.be.undefined;
    });
  });

  describe('validateTransmissionDelay', () => {
    before(() => {
      validator.init({ warn: () => {} });
    });

    it('should return the value unchanged when it is in the allowed list', () => {
      expect(validator.validateTransmissionDelay(1000)).to.equal(1000);
      expect(validator.validateTransmissionDelay(5000)).to.equal(5000);
      expect(validator.validateTransmissionDelay(10000)).to.equal(10000);
      expect(validator.validateTransmissionDelay(60000)).to.equal(60000);
    });

    it('should snap 2500 to nearest allowed value of 1000', () => {
      // 2500 is equidistant between 1000 and 5000 — reduce picks the first one found, which is 1000
      expect(validator.validateTransmissionDelay(2500)).to.equal(1000);
    });

    it('should snap 3000 to nearest allowed value of 1000 (equidistant, first match wins)', () => {
      // 3000 is equidistant between 1000 and 5000 — reduce keeps the first minimum, which is 1000
      expect(validator.validateTransmissionDelay(3000)).to.equal(1000);
    });

    it('should snap 4999 to nearest allowed value of 5000', () => {
      expect(validator.validateTransmissionDelay(4999)).to.equal(5000);
    });

    it('should snap 6000 to nearest allowed value of 5000', () => {
      expect(validator.validateTransmissionDelay(6000)).to.equal(5000);
    });

    it('should snap 72000 to nearest allowed value of 60000', () => {
      expect(validator.validateTransmissionDelay(72000)).to.equal(60000);
    });
  });
});
