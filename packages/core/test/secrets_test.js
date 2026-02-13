/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const testUtil = require('@_local/core/test/test_util');
const secrets = require('../src/secrets');
const expect = require('chai').expect;

describe('secrets with matcher mode', () => {
  before(() => {
    secrets.init({ logger: testUtil.createFakeLogger(), secrets: { matcherMode: 'contains-ignore-case' } });
  });

  describe('equals-ignore-case', () => {
    let matcher;

    beforeEach(() => {
      matcher = secrets.matchers['equals-ignore-case'](['secret-key', 'anotherKey', 'whatever']);
    });

    it('should match full string', () => {
      expect(matcher('secret-key')).to.be.true;
    });

    it('should match case insensitive', () => {
      expect(matcher('sEcReT-kEy')).to.be.true;
    });

    it('should match against all secrets insensitive', () => {
      expect(matcher('sEcReT-kEy')).to.be.true;
      expect(matcher('anotherkey')).to.be.true;
      expect(matcher('whatever')).to.be.true;
    });

    it('should not match substring', () => {
      expect(matcher('XXXsecret-keyXXX')).to.be.false;
    });

    it('should ignore null', () => {
      expect(matcher(null)).to.be.false;
    });

    it('should ignore undefined', () => {
      expect(matcher(undefined)).to.be.false;
    });

    it('should ignore wrong types', () => {
      expect(matcher(1302)).to.be.false;
    });

    it('should ignore borked secrets array', () => {
      matcher = secrets.matchers['equals-ignore-case']('not an array');
      expect(matcher('anything')).to.be.false;
      expect(matcher('KEY')).to.be.true;
    });

    it('should ignore secrets array with members of wrong type', () => {
      matcher = secrets.matchers['equals-ignore-case'](['secret', 13]);
      expect(matcher('secret')).to.be.true;
      expect(matcher(13)).to.be.false;
    });
  });

  describe('equals', () => {
    let matcher;

    beforeEach(() => {
      matcher = secrets.matchers.equals(['secret-key', 'anotherKey', 'whatever']);
    });

    it('should match full string', () => {
      expect(matcher('secret-key')).to.be.true;
    });

    it('should not match case insensitive', () => {
      expect(matcher('sEcReT-kEy')).to.be.false;
    });

    it('should match against all secrets', () => {
      expect(matcher('secret-key')).to.be.true;
      expect(matcher('anotherKey')).to.be.true;
      expect(matcher('whatever')).to.be.true;
    });

    it('should not match substring', () => {
      expect(matcher('XXXsecret-keyXXX')).to.be.false;
    });

    it('should ignore null', () => {
      expect(matcher(null)).to.be.false;
    });

    it('should ignore undefined', () => {
      expect(matcher(undefined)).to.be.false;
    });

    it('should ignore wrong types', () => {
      expect(matcher(1302)).to.be.false;
    });

    it('should ignore borked secrets array', () => {
      matcher = secrets.matchers.equals('not an array');
      expect(matcher('anything')).to.be.false;
      expect(matcher('key')).to.be.true;
    });

    it('should ignore secrets array with members of wrong type', () => {
      matcher = secrets.matchers.equals(['secret', 13]);
      expect(matcher('secret')).to.be.true;
      expect(matcher(13)).to.be.false;
    });
  });

  describe('contains-ignore-case', () => {
    let matcher;

    beforeEach(() => {
      matcher = secrets.matchers['contains-ignore-case'](['secret-key', 'anotherKey', 'whatever']);
    });

    it('should match full string', () => {
      expect(matcher('secret-key')).to.be.true;
    });

    it('should match substring', () => {
      expect(matcher('XXXsecret-keyXXX')).to.be.true;
    });

    it('should match substring case insensitive', () => {
      expect(matcher('XXXsEcReT-kEyXXX')).to.be.true;
    });

    it('should match against all secrets', () => {
      expect(matcher('XXXsEcReT-kEyXXX')).to.be.true;
      expect(matcher('123anotherkey456')).to.be.true;
      expect(matcher('.-=whaTever=-.')).to.be.true;
    });

    it('should ignore null', () => {
      expect(matcher(null)).to.be.false;
    });

    it('should ignore undefined', () => {
      expect(matcher(undefined)).to.be.false;
    });

    it('should ignore wrong types', () => {
      expect(matcher(1302)).to.be.false;
    });

    it('should ignore borked secrets array', () => {
      matcher = secrets.matchers['contains-ignore-case']('not an array');
      expect(matcher('anything')).to.be.false;
      expect(matcher('...PASSWORD...')).to.be.true;
    });

    it('should ignore secrets array with members of wrong type', () => {
      matcher = secrets.matchers['contains-ignore-case'](['secret', 13]);
      expect(matcher('XXXsEcRetZZZ')).to.be.true;
      expect(matcher(13)).to.be.false;
    });
  });

  describe('contains', () => {
    let matcher;

    beforeEach(() => {
      matcher = secrets.matchers.contains(['secret-key', 'anotherKey', 'whatever']);
    });

    it('should match full string', () => {
      expect(matcher('secret-key')).to.be.true;
    });

    it('should match substring', () => {
      expect(matcher('XXXsecret-key___')).to.be.true;
    });

    it('should not match case insensitive', () => {
      expect(matcher('sEcReT-kEy')).to.be.false;
    });

    it('should match against all secrets', () => {
      expect(matcher('secret-keyyyy')).to.be.true;
      expect(matcher('>>>anotherKey<<<')).to.be.true;
      expect(matcher('.-=whatever=-.')).to.be.true;
    });

    it('should ignore null', () => {
      expect(matcher(null)).to.be.false;
    });

    it('should ignore undefined', () => {
      expect(matcher(undefined)).to.be.false;
    });

    it('should ignore wrong types', () => {
      expect(matcher(1302)).to.be.false;
    });

    it('should ignore borked secrets array', () => {
      matcher = secrets.matchers.contains('not an array');
      expect(matcher('anything')).to.be.false;
      expect(matcher('__password__')).to.be.true;
    });

    it('should ignore secrets array with members of wrong type', () => {
      matcher = secrets.matchers.contains(['secret', 13]);
      expect(matcher('secret')).to.be.true;
      expect(matcher(13)).to.be.false;
    });
  });

  describe('regex', () => {
    let matcher;

    beforeEach(() => {
      matcher = secrets.matchers.regex(['abc.*xyz', '\\d{1,3}']);
    });

    it('should match regex', () => {
      expect(matcher('abcWHATEVERxyz')).to.be.true;
    });

    it('should not match when no regex matches', () => {
      expect(matcher('efgXuvw')).to.be.false;
      expect(matcher('1234')).to.be.false;
    });

    it('should not match case insensitive', () => {
      expect(matcher('ABCWHATEVERXYZ')).to.be.false;
    });

    it('should match against all secrets', () => {
      expect(matcher('abcWHATEVERxyz')).to.be.true;
      expect(matcher('123')).to.be.true;
      expect(matcher('9')).to.be.true;
    });

    it('should not match when regex matches a substring', () => {
      expect(matcher('ZZZabcXXXxyzZZZ')).to.be.false;
    });

    it('should handle regex string that starts with ^', () => {
      matcher = secrets.matchers.regex(['^regex']);
      expect(matcher('regex')).to.be.true;
      expect(matcher('Xregex')).to.be.false;
      expect(matcher('regexX')).to.be.false;
    });

    it('should handle regex string that ends with $', () => {
      matcher = secrets.matchers.regex(['regex$']);
      expect(matcher('regex')).to.be.true;
      expect(matcher('Xregex')).to.be.false;
      expect(matcher('regexX')).to.be.false;
    });

    it('should handle regex string that starts with ^ and ends with $', () => {
      matcher = secrets.matchers.regex(['^regex$']);
      expect(matcher('regex')).to.be.true;
      expect(matcher('Xregex')).to.be.false;
      expect(matcher('regexX')).to.be.false;
    });

    it('should ignore null', () => {
      expect(matcher(null)).to.be.false;
    });

    it('should ignore undefined', () => {
      expect(matcher(undefined)).to.be.false;
    });

    it('should ignore wrong types', () => {
      expect(matcher(1302)).to.be.false;
    });

    it('should ignore borked secrets array', () => {
      matcher = secrets.matchers.regex('not an array');
      expect(matcher('anything')).to.be.false;
      expect(matcher('key')).to.be.true; // default secret
      expect(matcher('pass')).to.be.true; // default secret
    });

    it('should ignore secrets array with members of wrong type', () => {
      matcher = secrets.matchers.regex(['secret', 13]);
      expect(matcher('secret')).to.be.true;
      expect(matcher(13)).to.be.false;
    });
  });

  describe('none', () => {
    let matcher;

    beforeEach(() => {
      matcher = secrets.matchers.none(['secret-key', 'anotherKey', 'whatever']);
    });

    it('should not match anything', () => {
      expect(matcher('secret-key')).to.be.false;
      expect(matcher('key')).to.be.false;
      expect(matcher('pass')).to.be.false;
    });
  });
});
