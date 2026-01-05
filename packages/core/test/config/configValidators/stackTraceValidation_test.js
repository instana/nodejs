/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { expect } = require('chai');

const stackTraceValidation = require('../../../src/config/configValidators/stackTraceValidation');

describe('config.configValidators.stackTraceValidation', () => {
  describe('validateStackTraceMode', () => {
    it('should validate "all" as valid', () => {
      const result = stackTraceValidation.validateStackTraceMode('all');
      expect(result.isValid).to.be.true;
      expect(result.error).to.be.null;
    });

    it('should validate "error" as valid', () => {
      const result = stackTraceValidation.validateStackTraceMode('error');
      expect(result.isValid).to.be.true;
      expect(result.error).to.be.null;
    });

    it('should validate "none" as valid', () => {
      const result = stackTraceValidation.validateStackTraceMode('none');
      expect(result.isValid).to.be.true;
      expect(result.error).to.be.null;
    });

    it('should validate uppercase "ALL" as valid', () => {
      const result = stackTraceValidation.validateStackTraceMode('ALL');
      expect(result.isValid).to.be.true;
      expect(result.error).to.be.null;
    });

    it('should validate mixed case "ErRoR" as valid', () => {
      const result = stackTraceValidation.validateStackTraceMode('ErRoR');
      expect(result.isValid).to.be.true;
      expect(result.error).to.be.null;
    });

    it('should validate mixed case "NoNe" as valid', () => {
      const result = stackTraceValidation.validateStackTraceMode('NoNe');
      expect(result.isValid).to.be.true;
      expect(result.error).to.be.null;
    });

    it('should reject null value', () => {
      const result = stackTraceValidation.validateStackTraceMode(null);
      expect(result.isValid).to.be.false;
      expect(result.error).to.include('cannot be null');
    });

    it('should reject invalid string value', () => {
      const result = stackTraceValidation.validateStackTraceMode('invalid');
      expect(result.isValid).to.be.false;
      expect(result.error).to.include('Invalid value: "invalid"');
    });

    it('should reject number type', () => {
      const result = stackTraceValidation.validateStackTraceMode(123);
      expect(result.isValid).to.be.false;
      expect(result.error).to.include('non-supported type number');
    });

    it('should reject boolean type', () => {
      const result = stackTraceValidation.validateStackTraceMode(true);
      expect(result.isValid).to.be.false;
      expect(result.error).to.include('non-supported type boolean');
    });

    it('should reject object type', () => {
      const result = stackTraceValidation.validateStackTraceMode({});
      expect(result.isValid).to.be.false;
      expect(result.error).to.include('non-supported type object');
    });

    it('should reject array type', () => {
      const result = stackTraceValidation.validateStackTraceMode(['error']);
      expect(result.isValid).to.be.false;
      expect(result.error).to.include('non-supported type object');
    });

    it('should reject undefined value', () => {
      const result = stackTraceValidation.validateStackTraceMode(undefined);
      expect(result.isValid).to.be.false;
      expect(result.error).to.include('non-supported type undefined');
    });

    it('should reject empty string', () => {
      const result = stackTraceValidation.validateStackTraceMode('');
      expect(result.isValid).to.be.false;
      expect(result.error).to.include('Invalid value: ""');
    });

    it('should reject string with only whitespace', () => {
      const result = stackTraceValidation.validateStackTraceMode('   ');
      expect(result.isValid).to.be.false;
      expect(result.error).to.include('Invalid value');
    });
  });

  describe('validateStackTraceLength', () => {
    it('should validate positive number', () => {
      const result = stackTraceValidation.validateStackTraceLength(10);
      expect(result.isValid).to.be.true;
      expect(result.error).to.be.null;
    });

    it('should validate zero', () => {
      const result = stackTraceValidation.validateStackTraceLength(0);
      expect(result.isValid).to.be.true;
      expect(result.error).to.be.null;
    });

    it('should validate negative number', () => {
      const result = stackTraceValidation.validateStackTraceLength(-10);
      expect(result.isValid).to.be.true;
      expect(result.error).to.be.null;
    });

    it('should validate large number', () => {
      const result = stackTraceValidation.validateStackTraceLength(1000);
      expect(result.isValid).to.be.true;
      expect(result.error).to.be.null;
    });

    it('should validate decimal number', () => {
      const result = stackTraceValidation.validateStackTraceLength(15.7);
      expect(result.isValid).to.be.true;
      expect(result.error).to.be.null;
    });

    it('should validate numeric string', () => {
      const result = stackTraceValidation.validateStackTraceLength('20');
      expect(result.isValid).to.be.true;
      expect(result.error).to.be.null;
    });

    it('should validate negative numeric string', () => {
      const result = stackTraceValidation.validateStackTraceLength('-15');
      expect(result.isValid).to.be.true;
      expect(result.error).to.be.null;
    });

    it('should validate decimal numeric string', () => {
      const result = stackTraceValidation.validateStackTraceLength('12.5');
      expect(result.isValid).to.be.true;
      expect(result.error).to.be.null;
    });

    it('should validate numeric string with leading zeros', () => {
      const result = stackTraceValidation.validateStackTraceLength('007');
      expect(result.isValid).to.be.true;
      expect(result.error).to.be.null;
    });

    it('should validate numeric string with whitespace', () => {
      const result = stackTraceValidation.validateStackTraceLength('  25  ');
      expect(result.isValid).to.be.true;
      expect(result.error).to.be.null;
    });

    it('should validate numeric string with plus sign', () => {
      const result = stackTraceValidation.validateStackTraceLength('+30');
      expect(result.isValid).to.be.true;
      expect(result.error).to.be.null;
    });

    it('should reject null value', () => {
      const result = stackTraceValidation.validateStackTraceLength(null);
      expect(result.isValid).to.be.false;
      expect(result.error).to.equal('The value cannot be null');
    });

    it('should reject undefined value', () => {
      const result = stackTraceValidation.validateStackTraceLength(undefined);
      expect(result.isValid).to.be.false;
      expect(result.error).to.equal('The value cannot be null');
    });

    it('should reject non-numeric string', () => {
      const result = stackTraceValidation.validateStackTraceLength('invalid');
      expect(result.isValid).to.be.false;
      expect(result.error).to.include('cannot be parsed to a numerical value');
    });

    it('should reject empty string', () => {
      const result = stackTraceValidation.validateStackTraceLength('');
      expect(result.isValid).to.be.false;
      expect(result.error).to.include('cannot be parsed to a numerical value');
    });

    it('should reject boolean type', () => {
      const result = stackTraceValidation.validateStackTraceLength(true);
      expect(result.isValid).to.be.false;
      expect(result.error).to.include('non-supported type boolean');
    });

    it('should reject object type', () => {
      const result = stackTraceValidation.validateStackTraceLength({});
      expect(result.isValid).to.be.false;
      expect(result.error).to.include('non-supported type object');
    });

    it('should reject array type', () => {
      const result = stackTraceValidation.validateStackTraceLength([10]);
      expect(result.isValid).to.be.false;
      expect(result.error).to.include('non-supported type object');
    });

    it('should reject Infinity', () => {
      const result = stackTraceValidation.validateStackTraceLength(Infinity);
      expect(result.isValid).to.be.false;
      expect(result.error).to.include('Invalid value: Infinity');
    });

    it('should reject -Infinity', () => {
      const result = stackTraceValidation.validateStackTraceLength(-Infinity);
      expect(result.isValid).to.be.false;
      expect(result.error).to.include('Invalid value: -Infinity');
    });

    it('should reject NaN', () => {
      const result = stackTraceValidation.validateStackTraceLength(NaN);
      expect(result.isValid).to.be.false;
      expect(result.error).to.include('Invalid value: NaN');
    });

    it('should reject string "Infinity"', () => {
      const result = stackTraceValidation.validateStackTraceLength('Infinity');
      expect(result.isValid).to.be.false;
      expect(result.error).to.include('cannot be parsed');
    });

    it('should reject string "NaN"', () => {
      const result = stackTraceValidation.validateStackTraceLength('NaN');
      expect(result.isValid).to.be.false;
      expect(result.error).to.include('cannot be parsed to a numerical value');
    });

    it('should reject function type', () => {
      const result = stackTraceValidation.validateStackTraceLength(() => 10);
      expect(result.isValid).to.be.false;
      expect(result.error).to.include('non-supported type function');
    });

    it('should reject symbol type', () => {
      const result = stackTraceValidation.validateStackTraceLength(Symbol('test'));
      expect(result.isValid).to.be.false;
      expect(result.error).to.include('non-supported type symbol');
    });
  });
});
