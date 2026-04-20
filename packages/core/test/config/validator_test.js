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
});
