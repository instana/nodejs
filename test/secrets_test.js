'use strict';

var secrets = require('../src/secrets');

var expect = require('chai').expect;

describe('secrets with matcher mode', function() {
  describe('equals-ignore-case', function() {
    var matcher;

    beforeEach(function() {
      matcher = secrets.matchers['equals-ignore-case'](['secret-key', 'anotherKey', 'whatever']);
    });

    it('should match full string', function() {
      expect(matcher('secret-key')).to.be.true;
    });

    it('should match case insensitive', function() {
      expect(matcher('sEcReT-kEy')).to.be.true;
    });

    it('should match against all secrets insensitive', function() {
      expect(matcher('sEcReT-kEy')).to.be.true;
      expect(matcher('anotherkey')).to.be.true;
      expect(matcher('whatever')).to.be.true;
    });

    it('should not match substring', function() {
      expect(matcher('XXXsecret-keyXXX')).to.be.false;
    });

    it('should ignore null', function() {
      expect(matcher(null)).to.be.false;
    });

    it('should ignore undefined', function() {
      expect(matcher(undefined)).to.be.false;
    });

    it('should ignore wrong types', function() {
      expect(matcher(1302)).to.be.false;
    });

    it('should ignore borked secrets array', function() {
      matcher = secrets.matchers['equals-ignore-case']('not an array');
      expect(matcher('anything')).to.be.false;
      expect(matcher('KEY')).to.be.true;
    });

    it('should ignore secrets array with members of wrong type', function() {
      matcher = secrets.matchers['equals-ignore-case'](['secret', 13]);
      expect(matcher('secret')).to.be.true;
      expect(matcher(13)).to.be.false;
    });
  });

  describe('equals', function() {
    var matcher;

    beforeEach(function() {
      matcher = secrets.matchers.equals(['secret-key', 'anotherKey', 'whatever']);
    });

    it('should match full string', function() {
      expect(matcher('secret-key')).to.be.true;
    });

    it('should not match case insensitive', function() {
      expect(matcher('sEcReT-kEy')).to.be.false;
    });

    it('should match against all secrets', function() {
      expect(matcher('secret-key')).to.be.true;
      expect(matcher('anotherKey')).to.be.true;
      expect(matcher('whatever')).to.be.true;
    });

    it('should not match substring', function() {
      expect(matcher('XXXsecret-keyXXX')).to.be.false;
    });

    it('should ignore null', function() {
      expect(matcher(null)).to.be.false;
    });

    it('should ignore undefined', function() {
      expect(matcher(undefined)).to.be.false;
    });

    it('should ignore wrong types', function() {
      expect(matcher(1302)).to.be.false;
    });

    it('should ignore borked secrets array', function() {
      matcher = secrets.matchers.equals('not an array');
      expect(matcher('anything')).to.be.false;
      expect(matcher('key')).to.be.true;
    });

    it('should ignore secrets array with members of wrong type', function() {
      matcher = secrets.matchers.equals(['secret', 13]);
      expect(matcher('secret')).to.be.true;
      expect(matcher(13)).to.be.false;
    });
  });

  describe('contains-ignore-case', function() {
    var matcher;

    beforeEach(function() {
      matcher = secrets.matchers['contains-ignore-case'](['secret-key', 'anotherKey', 'whatever']);
    });

    it('should match full string', function() {
      expect(matcher('secret-key')).to.be.true;
    });

    it('should match substring', function() {
      expect(matcher('XXXsecret-keyXXX')).to.be.true;
    });

    it('should match substring case insensitive', function() {
      expect(matcher('XXXsEcReT-kEyXXX')).to.be.true;
    });

    it('should match against all secrets', function() {
      expect(matcher('XXXsEcReT-kEyXXX')).to.be.true;
      expect(matcher('123anotherkey456')).to.be.true;
      expect(matcher('.-=whaTever=-.')).to.be.true;
    });

    it('should ignore null', function() {
      expect(matcher(null)).to.be.false;
    });

    it('should ignore undefined', function() {
      expect(matcher(undefined)).to.be.false;
    });

    it('should ignore wrong types', function() {
      expect(matcher(1302)).to.be.false;
    });

    it('should ignore borked secrets array', function() {
      matcher = secrets.matchers['contains-ignore-case']('not an array');
      expect(matcher('anything')).to.be.false;
      expect(matcher('...PASSWORD...')).to.be.true;
    });

    it('should ignore secrets array with members of wrong type', function() {
      matcher = secrets.matchers['contains-ignore-case'](['secret', 13]);
      expect(matcher('XXXsEcRetZZZ')).to.be.true;
      expect(matcher(13)).to.be.false;
    });
  });

  describe('contains', function() {
    var matcher;

    beforeEach(function() {
      matcher = secrets.matchers.contains(['secret-key', 'anotherKey', 'whatever']);
    });

    it('should match full string', function() {
      expect(matcher('secret-key')).to.be.true;
    });

    it('should match substring', function() {
      expect(matcher('XXXsecret-key___')).to.be.true;
    });

    it('should not match case insensitive', function() {
      expect(matcher('sEcReT-kEy')).to.be.false;
    });

    it('should match against all secrets', function() {
      expect(matcher('secret-keyyyy')).to.be.true;
      expect(matcher('>>>anotherKey<<<')).to.be.true;
      expect(matcher('.-=whatever=-.')).to.be.true;
    });

    it('should ignore null', function() {
      expect(matcher(null)).to.be.false;
    });

    it('should ignore undefined', function() {
      expect(matcher(undefined)).to.be.false;
    });

    it('should ignore wrong types', function() {
      expect(matcher(1302)).to.be.false;
    });

    it('should ignore borked secrets array', function() {
      matcher = secrets.matchers.contains('not an array');
      expect(matcher('anything')).to.be.false;
      expect(matcher('__password__')).to.be.true;
    });

    it('should ignore secrets array with members of wrong type', function() {
      matcher = secrets.matchers.contains(['secret', 13]);
      expect(matcher('secret')).to.be.true;
      expect(matcher(13)).to.be.false;
    });
  });

  describe('regex', function() {
    var matcher;

    beforeEach(function() {
      matcher = secrets.matchers.regex(['abc.*xyz', '\\d{1,3}']);
    });

    it('should match regex', function() {
      expect(matcher('abcWHATEVERxyz')).to.be.true;
    });

    it('should not match when no regex matches', function() {
      expect(matcher('efgXuvw')).to.be.false;
      expect(matcher('1234')).to.be.false;
    });

    it('should not match case insensitive', function() {
      expect(matcher('ABCWHATEVERXYZ')).to.be.false;
    });

    it('should match against all secrets', function() {
      expect(matcher('abcWHATEVERxyz')).to.be.true;
      expect(matcher('123')).to.be.true;
      expect(matcher('9')).to.be.true;
    });

    it('should not match when regex matches a substring', function() {
      expect(matcher('ZZZabcXXXxyzZZZ')).to.be.false;
    });

    it('should handle regex string that starts with ^', function() {
      matcher = secrets.matchers.regex(['^regex']);
      expect(matcher('regex')).to.be.true;
      expect(matcher('Xregex')).to.be.false;
      expect(matcher('regexX')).to.be.false;
    });

    it('should handle regex string that ends with $', function() {
      matcher = secrets.matchers.regex(['regex$']);
      expect(matcher('regex')).to.be.true;
      expect(matcher('Xregex')).to.be.false;
      expect(matcher('regexX')).to.be.false;
    });

    it('should handle regex string that starts with ^ and ends with $', function() {
      matcher = secrets.matchers.regex(['^regex$']);
      expect(matcher('regex')).to.be.true;
      expect(matcher('Xregex')).to.be.false;
      expect(matcher('regexX')).to.be.false;
    });

    it('should ignore null', function() {
      expect(matcher(null)).to.be.false;
    });

    it('should ignore undefined', function() {
      expect(matcher(undefined)).to.be.false;
    });

    it('should ignore wrong types', function() {
      expect(matcher(1302)).to.be.false;
    });

    it('should ignore borked secrets array', function() {
      matcher = secrets.matchers.regex('not an array');
      expect(matcher('anything')).to.be.false;
      expect(matcher('key')).to.be.true; // default secret
      expect(matcher('pass')).to.be.true; // default secret
    });

    it('should ignore secrets array with members of wrong type', function() {
      matcher = secrets.matchers.regex(['secret', 13]);
      expect(matcher('secret')).to.be.true;
      expect(matcher(13)).to.be.false;
    });
  });

  describe('none', function() {
    var matcher;

    beforeEach(function() {
      matcher = secrets.matchers.none(['secret-key', 'anotherKey', 'whatever']);
    });

    it('should not match anything', function() {
      expect(matcher('secret-key')).to.be.false;
      expect(matcher('key')).to.be.false;
      expect(matcher('pass')).to.be.false;
    });
  });
});
