/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('mocha');
const { expect } = require('chai');
const sinon = require('sinon');

const secrets = require('../../../src/config/configNormalizers/secrets');

function resetEnv() {
  delete process.env.INSTANA_SECRETS;
}

describe('config.configNormalizers.secrets', () => {
  let loggerStub;

  beforeEach(() => {
    resetEnv();
    loggerStub = {
      debug: sinon.stub(),
      info: sinon.stub(),
      warn: sinon.stub(),
      error: sinon.stub(),
      trace: sinon.stub()
    };

    secrets.init({ logger: loggerStub });
  });

  afterEach(() => {
    resetEnv();
  });

  describe('normalize()', () => {
    const defaults = {
      matcherMode: 'contains-ignore-case',
      keywords: ['key', 'pass', 'secret']
    };

    it('should use defaults when config is null', () => {
      const result = secrets.normalize(null, defaults);

      expect(result.matcherMode).to.equal('contains-ignore-case');
      expect(result.keywords).to.deep.equal(['key', 'pass', 'secret']);
    });

    it('should use defaults when config is empty object', () => {
      const result = secrets.normalize({}, defaults);

      expect(result.matcherMode).to.equal('contains-ignore-case');
      expect(result.keywords).to.deep.equal(['key', 'pass', 'secret']);
    });

    it('should use config values when provided', () => {
      const config = {
        matcherMode: 'equals',
        keywords: ['password', 'token']
      };

      const result = secrets.normalize(config, defaults);

      expect(result.matcherMode).to.equal('equals');
      expect(result.keywords).to.deep.equal(['password', 'token']);
    });

    it('should validate and reject invalid matcherMode (non-string)', () => {
      const config = {
        matcherMode: 123,
        keywords: ['password']
      };

      const result = secrets.normalize(config, defaults);

      expect(result.matcherMode).to.equal('contains-ignore-case');
      expect(loggerStub.warn.calledOnce).to.be.true;
      expect(loggerStub.warn.firstCall.args[0]).to.include('is not a string');
    });

    it('should validate and reject unsupported matcherMode', () => {
      const config = {
        matcherMode: 'invalid-mode',
        keywords: ['password']
      };

      const result = secrets.normalize(config, defaults);

      expect(result.matcherMode).to.equal('contains-ignore-case');
      expect(loggerStub.warn.calledOnce).to.be.true;
      expect(loggerStub.warn.firstCall.args[0]).to.include('not a supported matcher mode');
    });

    it('should validate and reject invalid keywords (non-array)', () => {
      const config = {
        matcherMode: 'equals',
        keywords: 'password'
      };

      const result = secrets.normalize(config, defaults);

      expect(result.keywords).to.deep.equal(['key', 'pass', 'secret']);
      expect(loggerStub.warn.calledOnce).to.be.true;
      expect(loggerStub.warn.firstCall.args[0]).to.include('is not an array');
    });

    it('should clear keywords when matcherMode is "none"', () => {
      const config = {
        matcherMode: 'none',
        keywords: ['password', 'token']
      };

      const result = secrets.normalize(config, defaults);

      expect(result.matcherMode).to.equal('none');
      expect(result.keywords).to.deep.equal([]);
    });

    it('should accept all valid matcher modes', () => {
      const validModes = ['equals', 'equals-ignore-case', 'contains', 'contains-ignore-case', 'regex', 'none'];

      validModes.forEach(mode => {
        const config = {
          matcherMode: mode,
          keywords: ['test']
        };

        const result = secrets.normalize(config, defaults);
        expect(result.matcherMode).to.equal(mode);
      });
    });

    describe('with INSTANA_SECRETS environment variable', () => {
      it('should parse env var with valid format', () => {
        process.env.INSTANA_SECRETS = 'equals:password,token,secret';

        const result = secrets.normalize({}, defaults);

        expect(result.matcherMode).to.equal('equals');
        expect(result.keywords).to.deep.equal(['password', 'token', 'secret']);
      });

      it('should parse env var with case-insensitive matcher mode', () => {
        process.env.INSTANA_SECRETS = 'EQUALS-IGNORE-CASE:password,token';

        const result = secrets.normalize({}, defaults);

        expect(result.matcherMode).to.equal('equals-ignore-case');
        expect(result.keywords).to.deep.equal(['password', 'token']);
      });

      it('should trim whitespace from keywords', () => {
        process.env.INSTANA_SECRETS = 'contains:  password  ,  token  ,  secret  ';

        const result = secrets.normalize({}, defaults);

        expect(result.keywords).to.deep.equal(['password', 'token', 'secret']);
      });

      it('should handle "none" matcher mode from env var', () => {
        process.env.INSTANA_SECRETS = 'none:anything';

        const result = secrets.normalize({}, defaults);

        expect(result.matcherMode).to.equal('none');
        expect(result.keywords).to.deep.equal([]);
      });

      it('should warn and use defaults when env var format is invalid (missing keywords)', () => {
        process.env.INSTANA_SECRETS = 'equals';

        const result = secrets.normalize({}, defaults);

        expect(result.matcherMode).to.equal('contains-ignore-case');
        expect(result.keywords).to.deep.equal(['key', 'pass', 'secret']);
        expect(loggerStub.warn.calledOnce).to.be.true;
        expect(loggerStub.warn.firstCall.args[0]).to.include('cannot be parsed');
      });

      it('should use default matcher mode when env var has invalid mode', () => {
        process.env.INSTANA_SECRETS = 'invalid-mode:password,token';

        const result = secrets.normalize({}, defaults);

        expect(result.matcherMode).to.equal('contains-ignore-case');
        expect(result.keywords).to.deep.equal(['password', 'token']);
      });

      it('should prefer config over env var', () => {
        process.env.INSTANA_SECRETS = 'equals:env-password';

        const config = {
          matcherMode: 'contains',
          keywords: ['config-password']
        };

        const result = secrets.normalize(config, defaults);

        expect(result.matcherMode).to.equal('contains');
        expect(result.keywords).to.deep.equal(['config-password']);
      });

      it('should use env var when config is not provided', () => {
        process.env.INSTANA_SECRETS = 'regex:password,token';

        const result = secrets.normalize({}, defaults);

        expect(result.matcherMode).to.equal('regex');
        expect(result.keywords).to.deep.equal(['password', 'token']);
      });
    });

    describe('validation independence', () => {
      it('should validate matcherMode and keywords independently', () => {
        const config = {
          matcherMode: 'invalid-mode',
          keywords: 'not-an-array'
        };

        const result = secrets.normalize(config, defaults);

        expect(result.matcherMode).to.equal('contains-ignore-case');
        expect(result.keywords).to.deep.equal(['key', 'pass', 'secret']);
        expect(loggerStub.warn.calledTwice).to.be.true;
      });

      it('should validate keywords even when matcherMode is valid', () => {
        const config = {
          matcherMode: 'equals',
          keywords: null
        };

        const result = secrets.normalize(config, defaults);

        expect(result.matcherMode).to.equal('equals');
        expect(result.keywords).to.deep.equal(['key', 'pass', 'secret']);
        expect(loggerStub.warn.calledOnce).to.be.true;
      });
    });

    describe('edge cases', () => {
      it('should handle empty keywords array', () => {
        const config = {
          matcherMode: 'equals',
          keywords: []
        };

        const result = secrets.normalize(config, defaults);

        expect(result.matcherMode).to.equal('equals');
        expect(result.keywords).to.deep.equal([]);
      });

      it('should handle single keyword', () => {
        const config = {
          matcherMode: 'contains',
          keywords: ['password']
        };

        const result = secrets.normalize(config, defaults);

        expect(result.matcherMode).to.equal('contains');
        expect(result.keywords).to.deep.equal(['password']);
      });

      it('should handle matcherMode with mixed case', () => {
        const config = {
          matcherMode: 'CoNtAiNs-IgNoRe-CaSe',
          keywords: ['password']
        };

        const result = secrets.normalize(config, defaults);

        expect(result.matcherMode).to.equal('contains-ignore-case');
        expect(loggerStub.warn.calledOnce).to.be.true;
      });
    });
  });
});
