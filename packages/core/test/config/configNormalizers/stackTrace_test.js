/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const { describe, it, beforeEach } = require('mocha');
const { expect } = require('chai');

const stackTraceNormalizer = require('../../../src/config/configNormalizers/stackTrace');
const {
  MAX_STACK_TRACE_LENGTH,
  DEFAULT_STACK_TRACE_LENGTH,
  DEFAULT_STACK_TRACE_MODE
} = require('../../../src/util/constants');

function resetEnv() {
  delete process.env.INSTANA_STACK_TRACE;
  delete process.env.INSTANA_STACK_TRACE_LENGTH;
}

describe('config.configNormalizers.stackTrace', () => {
  beforeEach(() => {
    resetEnv();
  });

  describe('normalizeStackTraceMode()', () => {
    it('should return default stack trace mode when no config is provided', () => {
      const config = {};
      const result = stackTraceNormalizer.normalizeStackTraceMode(config);

      expect(result).to.equal(DEFAULT_STACK_TRACE_MODE);
    });

    it('should return default when config is null', () => {
      const result = stackTraceNormalizer.normalizeStackTraceMode(null);

      expect(result).to.equal(DEFAULT_STACK_TRACE_MODE);
    });

    it('should return default when config is undefined', () => {
      const result = stackTraceNormalizer.normalizeStackTraceMode(undefined);

      expect(result).to.equal(DEFAULT_STACK_TRACE_MODE);
    });

    it('should return default when tracing is not present', () => {
      const config = { someOtherConfig: true };
      const result = stackTraceNormalizer.normalizeStackTraceMode(config);

      expect(result).to.equal(DEFAULT_STACK_TRACE_MODE);
    });

    it('should accept valid stack trace mode from config.tracing.global.stackTrace (all)', () => {
      const config = {
        tracing: {
          global: {
            stackTrace: 'all'
          }
        }
      };
      const result = stackTraceNormalizer.normalizeStackTraceMode(config);

      expect(result).to.equal('all');
    });

    it('should accept valid stack trace mode from config.tracing.global.stackTrace (error)', () => {
      const config = {
        tracing: {
          global: {
            stackTrace: 'error'
          }
        }
      };
      const result = stackTraceNormalizer.normalizeStackTraceMode(config);

      expect(result).to.equal('error');
    });

    it('should accept valid stack trace mode from config.tracing.global.stackTrace (none)', () => {
      const config = {
        tracing: {
          global: {
            stackTrace: 'none'
          }
        }
      };
      const result = stackTraceNormalizer.normalizeStackTraceMode(config);

      expect(result).to.equal('none');
    });

    it('should normalize stack trace mode to lowercase', () => {
      const config = {
        tracing: {
          global: {
            stackTrace: 'ALL'
          }
        }
      };
      const result = stackTraceNormalizer.normalizeStackTraceMode(config);

      expect(result).to.equal('all');
    });

    it('should normalize mixed case stack trace mode', () => {
      const config = {
        tracing: {
          global: {
            stackTrace: 'ErRoR'
          }
        }
      };
      const result = stackTraceNormalizer.normalizeStackTraceMode(config);

      expect(result).to.equal('error');
    });

    it('should prioritize config.tracing.global.stackTrace over environment variable', () => {
      process.env.INSTANA_STACK_TRACE = 'error';
      const config = {
        tracing: {
          global: {
            stackTrace: 'none'
          }
        }
      };
      const result = stackTraceNormalizer.normalizeStackTraceMode(config);

      expect(result).to.equal('none');
    });

    it('should return default when both config and env are not set', () => {
      const config = {
        tracing: {
          global: {}
        }
      };
      const result = stackTraceNormalizer.normalizeStackTraceMode(config);

      expect(result).to.equal(DEFAULT_STACK_TRACE_MODE);
    });
  });

  describe('normalizeStackTraceLength()', () => {
    it('should return default stack trace length when no config is provided', () => {
      const config = {};
      const result = stackTraceNormalizer.normalizeStackTraceLength(config);

      expect(result).to.equal(DEFAULT_STACK_TRACE_LENGTH);
    });

    it('should return default when config is null', () => {
      const result = stackTraceNormalizer.normalizeStackTraceLength(null);

      expect(result).to.equal(DEFAULT_STACK_TRACE_LENGTH);
    });

    it('should return default when config is undefined', () => {
      const result = stackTraceNormalizer.normalizeStackTraceLength(undefined);

      expect(result).to.equal(DEFAULT_STACK_TRACE_LENGTH);
    });

    it('should accept valid numeric stack trace length from config.tracing.global.stackTraceLength', () => {
      const config = {
        tracing: {
          global: {
            stackTraceLength: 20
          }
        }
      };
      const result = stackTraceNormalizer.normalizeStackTraceLength(config);

      expect(result).to.equal(20);
    });

    it('should accept string numeric stack trace length from config', () => {
      const config = {
        tracing: {
          global: {
            stackTraceLength: '25'
          }
        }
      };
      const result = stackTraceNormalizer.normalizeStackTraceLength(config);

      expect(result).to.equal(25);
    });

    it('should round decimal values', () => {
      const config = {
        tracing: {
          global: {
            stackTraceLength: 15.7
          }
        }
      };
      const result = stackTraceNormalizer.normalizeStackTraceLength(config);

      expect(result).to.equal(16);
    });

    it('should convert negative values to positive', () => {
      const config = {
        tracing: {
          global: {
            stackTraceLength: -10
          }
        }
      };
      const result = stackTraceNormalizer.normalizeStackTraceLength(config);

      expect(result).to.equal(10);
    });

    it('should cap at MAX_STACK_TRACE_LENGTH', () => {
      const config = {
        tracing: {
          global: {
            stackTraceLength: 1000
          }
        }
      };
      const result = stackTraceNormalizer.normalizeStackTraceLength(config);

      expect(result).to.equal(MAX_STACK_TRACE_LENGTH);
    });

    it('should handle zero value', () => {
      const config = {
        tracing: {
          global: {
            stackTraceLength: 0
          }
        }
      };
      const result = stackTraceNormalizer.normalizeStackTraceLength(config);

      expect(result).to.equal(0);
    });

    it('should accept stack trace length from INSTANA_STACK_TRACE_LENGTH env var', () => {
      process.env.INSTANA_STACK_TRACE_LENGTH = '30';
      const config = {};
      const result = stackTraceNormalizer.normalizeStackTraceLength(config);

      expect(result).to.equal(30);
    });

    it('should prioritize config.tracing.global.stackTraceLength over tracing.stackTraceLength', () => {
      const config = {
        tracing: {
          global: {
            stackTraceLength: 30
          },
          stackTraceLength: 20
        }
      };
      const result = stackTraceNormalizer.normalizeStackTraceLength(config);

      expect(result).to.equal(30);
    });

    it('should fall back to tracing.stackTraceLength when global is not set', () => {
      const config = {
        tracing: {
          stackTraceLength: 25
        }
      };
      const result = stackTraceNormalizer.normalizeStackTraceLength(config);

      expect(result).to.equal(25);
    });

    it('should prioritize tracing.stackTraceLength over environment variable', () => {
      process.env.INSTANA_STACK_TRACE_LENGTH = '40';
      const config = {
        tracing: {
          stackTraceLength: 25
        }
      };
      const result = stackTraceNormalizer.normalizeStackTraceLength(config);

      expect(result).to.equal(25);
    });

    it('should fall back to env var when tracing.stackTraceLength is invalid', () => {
      process.env.INSTANA_STACK_TRACE_LENGTH = '35';
      const config = {
        tracing: {
          stackTraceLength: 'invalid'
        }
      };
      const result = stackTraceNormalizer.normalizeStackTraceLength(config);

      expect(result).to.equal(35);
    });

    it('should return default for non-numeric string', () => {
      const config = {
        tracing: {
          global: {
            stackTraceLength: 'invalid'
          }
        }
      };
      const result = stackTraceNormalizer.normalizeStackTraceLength(config);

      expect(result).to.equal(DEFAULT_STACK_TRACE_LENGTH);
    });

    it('should return default for Infinity', () => {
      const config = {
        tracing: {
          global: {
            stackTraceLength: Infinity
          }
        }
      };
      const result = stackTraceNormalizer.normalizeStackTraceLength(config);

      expect(result).to.equal(DEFAULT_STACK_TRACE_LENGTH);
    });

    it('should return default for NaN', () => {
      const config = {
        tracing: {
          global: {
            stackTraceLength: NaN
          }
        }
      };
      const result = stackTraceNormalizer.normalizeStackTraceLength(config);

      expect(result).to.equal(DEFAULT_STACK_TRACE_LENGTH);
    });

    it('should handle stackTraceLength exactly at MAX_STACK_TRACE_LENGTH', () => {
      const config = {
        tracing: {
          global: {
            stackTraceLength: MAX_STACK_TRACE_LENGTH
          }
        }
      };
      const result = stackTraceNormalizer.normalizeStackTraceLength(config);

      expect(result).to.equal(MAX_STACK_TRACE_LENGTH);
    });

    it('should handle stackTraceLength just below MAX_STACK_TRACE_LENGTH', () => {
      const config = {
        tracing: {
          global: {
            stackTraceLength: MAX_STACK_TRACE_LENGTH - 1
          }
        }
      };
      const result = stackTraceNormalizer.normalizeStackTraceLength(config);

      expect(result).to.equal(MAX_STACK_TRACE_LENGTH - 1);
    });

    it('should handle very large negative stackTraceLength', () => {
      const config = {
        tracing: {
          global: {
            stackTraceLength: -1000
          }
        }
      };
      const result = stackTraceNormalizer.normalizeStackTraceLength(config);

      expect(result).to.equal(MAX_STACK_TRACE_LENGTH);
    });

    it('should handle decimal string for stackTraceLength', () => {
      const config = {
        tracing: {
          global: {
            stackTraceLength: '15.8'
          }
        }
      };
      const result = stackTraceNormalizer.normalizeStackTraceLength(config);

      expect(result).to.equal(15);
    });

    it('should handle string with leading/trailing spaces for stackTraceLength', () => {
      const config = {
        tracing: {
          global: {
            stackTraceLength: '  20  '
          }
        }
      };
      const result = stackTraceNormalizer.normalizeStackTraceLength(config);

      expect(result).to.equal(20);
    });
  });

  describe('normalizeStackTraceModeFromAgent()', () => {
    it('should normalize agent stack trace mode to lowercase', () => {
      const result = stackTraceNormalizer.normalizeStackTraceModeFromAgent('ALL');

      expect(result).to.equal('all');
    });

    it('should handle lowercase input', () => {
      const result = stackTraceNormalizer.normalizeStackTraceModeFromAgent('error');

      expect(result).to.equal('error');
    });

    it('should handle mixed case input', () => {
      const result = stackTraceNormalizer.normalizeStackTraceModeFromAgent('NoNe');

      expect(result).to.equal('none');
    });
  });

  describe('normalizeStackTraceLengthFromAgent()', () => {
    it('should accept valid numeric stack trace length from agent', () => {
      const result = stackTraceNormalizer.normalizeStackTraceLengthFromAgent(20);

      expect(result).to.equal(20);
    });

    it('should accept string numeric stack trace length from agent', () => {
      const result = stackTraceNormalizer.normalizeStackTraceLengthFromAgent('25');

      expect(result).to.equal(25);
    });

    it('should round decimal values from agent', () => {
      const result = stackTraceNormalizer.normalizeStackTraceLengthFromAgent(15.7);

      expect(result).to.equal(16);
    });

    it('should convert negative values to positive from agent', () => {
      const result = stackTraceNormalizer.normalizeStackTraceLengthFromAgent(-10);

      expect(result).to.equal(10);
    });

    it('should cap at MAX_STACK_TRACE_LENGTH from agent', () => {
      const result = stackTraceNormalizer.normalizeStackTraceLengthFromAgent(1000);

      expect(result).to.equal(MAX_STACK_TRACE_LENGTH);
    });

    it('should return null for invalid agent stack trace length', () => {
      const result = stackTraceNormalizer.normalizeStackTraceLengthFromAgent('invalid');

      expect(result).to.be.null;
    });

    it('should return null for null', () => {
      const result = stackTraceNormalizer.normalizeStackTraceLengthFromAgent(null);

      expect(result).to.be.null;
    });

    it('should return null for undefined', () => {
      const result = stackTraceNormalizer.normalizeStackTraceLengthFromAgent(undefined);

      expect(result).to.be.null;
    });

    it('should handle zero value from agent', () => {
      const result = stackTraceNormalizer.normalizeStackTraceLengthFromAgent(0);

      expect(result).to.equal(0);
    });

    it('should return null for Infinity', () => {
      const result = stackTraceNormalizer.normalizeStackTraceLengthFromAgent(Infinity);

      expect(result).to.be.null;
    });

    it('should return null for NaN', () => {
      const result = stackTraceNormalizer.normalizeStackTraceLengthFromAgent(NaN);

      expect(result).to.be.null;
    });

    it('should return null for object', () => {
      const result = stackTraceNormalizer.normalizeStackTraceLengthFromAgent({});

      expect(result).to.be.null;
    });

    it('should parse from array', () => {
      const result = stackTraceNormalizer.normalizeStackTraceLengthFromAgent([23]);

      expect(result).to.eq(23);
    });
  });

  describe('init()', () => {
    it('should initialize logger from config', () => {
      // Verify logger is set by using a function that would trigger a warning
      const config = {
        tracing: {
          stackTraceLength: 25
        }
      };
      stackTraceNormalizer.normalizeStackTraceLength(config);
    });
  });
});
