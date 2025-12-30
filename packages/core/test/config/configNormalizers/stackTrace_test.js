/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const { describe, it, beforeEach } = require('mocha');
const { expect } = require('chai');

const stackTraceNormalizer = require('../../../src/config/configNormalizers/stackTrace');
const { MAX_STACK_TRACE_LENGTH } = require('../../../src/util/constants');

function resetEnv() {
  delete process.env.INSTANA_STACK_TRACE;
  delete process.env.INSTANA_STACK_TRACE_LENGTH;
}

describe('config.configNormalizers.stackTrace', () => {
  beforeEach(() => {
    resetEnv();
  });

  describe('normalizeStackTraceMode()', () => {
    it('should return null when no config is provided', () => {
      const config = {};
      const result = stackTraceNormalizer.normalizeStackTraceMode(config);

      expect(result).to.be.null;
    });

    it('should return null when config is null', () => {
      const result = stackTraceNormalizer.normalizeStackTraceMode(null);

      expect(result).to.be.null;
    });

    it('should return null when config is undefined', () => {
      const result = stackTraceNormalizer.normalizeStackTraceMode(undefined);

      expect(result).to.be.null;
    });

    it('should return null when tracing is not present', () => {
      const config = { someOtherConfig: true };
      const result = stackTraceNormalizer.normalizeStackTraceMode(config);

      expect(result).to.be.null;
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

    it('should return null for invalid stack trace mode', () => {
      const config = {
        tracing: {
          global: {
            stackTrace: 'invalid'
          }
        }
      };
      const result = stackTraceNormalizer.normalizeStackTraceMode(config);

      expect(result).to.be.null;
    });

    it('should return null when config.tracing.global is empty', () => {
      const config = {
        tracing: {
          global: {}
        }
      };
      const result = stackTraceNormalizer.normalizeStackTraceMode(config);

      expect(result).to.be.null;
    });

    it('should return null for non-string values', () => {
      const config = {
        tracing: {
          global: {
            stackTrace: 123
          }
        }
      };
      const result = stackTraceNormalizer.normalizeStackTraceMode(config);

      expect(result).to.be.null;
    });
  });

  describe('normalizeStackTraceLength()', () => {
    it('should return null when no config is provided', () => {
      const config = {};
      const result = stackTraceNormalizer.normalizeStackTraceLength(config);

      expect(result).to.be.null;
    });

    it('should return null when config is null', () => {
      const result = stackTraceNormalizer.normalizeStackTraceLength(null);

      expect(result).to.be.null;
    });

    it('should return null when config is undefined', () => {
      const result = stackTraceNormalizer.normalizeStackTraceLength(undefined);

      expect(result).to.be.null;
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

    it('should return null for non-numeric string', () => {
      const config = {
        tracing: {
          global: {
            stackTraceLength: 'invalid'
          }
        }
      };
      const result = stackTraceNormalizer.normalizeStackTraceLength(config);

      expect(result).to.be.null;
    });

    it('should return null for Infinity', () => {
      const config = {
        tracing: {
          global: {
            stackTraceLength: Infinity
          }
        }
      };
      const result = stackTraceNormalizer.normalizeStackTraceLength(config);

      expect(result).to.be.null;
    });

    it('should return null for NaN', () => {
      const config = {
        tracing: {
          global: {
            stackTraceLength: NaN
          }
        }
      };
      const result = stackTraceNormalizer.normalizeStackTraceLength(config);

      expect(result).to.be.null;
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

  describe('normalizeStackTraceModeEnv()', () => {
    it('should normalize valid env value to lowercase', () => {
      const result = stackTraceNormalizer.normalizeStackTraceModeEnv('ALL');

      expect(result).to.equal('all');
    });

    it('should handle lowercase input', () => {
      const result = stackTraceNormalizer.normalizeStackTraceModeEnv('error');

      expect(result).to.equal('error');
    });

    it('should handle mixed case input', () => {
      const result = stackTraceNormalizer.normalizeStackTraceModeEnv('NoNe');

      expect(result).to.equal('none');
    });

    it('should return null for invalid mode', () => {
      const result = stackTraceNormalizer.normalizeStackTraceModeEnv('invalid');

      expect(result).to.be.null;
    });

    it('should return null for empty string', () => {
      const result = stackTraceNormalizer.normalizeStackTraceModeEnv('');

      expect(result).to.be.null;
    });

    it('should return null for null', () => {
      const result = stackTraceNormalizer.normalizeStackTraceModeEnv(null);

      expect(result).to.be.null;
    });

    it('should return null for undefined', () => {
      const result = stackTraceNormalizer.normalizeStackTraceModeEnv(undefined);

      expect(result).to.be.null;
    });

    it('should handle numeric string by converting to string', () => {
      const result = stackTraceNormalizer.normalizeStackTraceModeEnv(123);

      expect(result).to.be.null;
    });

    describe('normalizeStackTraceLengthEnv()', () => {
      it('should accept valid numeric string from env', () => {
        const result = stackTraceNormalizer.normalizeStackTraceLengthEnv('20');

        expect(result).to.equal(20);
      });

      it('should round decimal string values', () => {
        const result = stackTraceNormalizer.normalizeStackTraceLengthEnv('15.2');

        expect(result).to.equal(15);
      });

      it('should convert negative string values to positive', () => {
        const result = stackTraceNormalizer.normalizeStackTraceLengthEnv('-10');

        expect(result).to.equal(10);
      });

      it('should cap at MAX_STACK_TRACE_LENGTH', () => {
        const result = stackTraceNormalizer.normalizeStackTraceLengthEnv('1000');

        expect(result).to.equal(MAX_STACK_TRACE_LENGTH);
      });

      it('should handle zero value', () => {
        const result = stackTraceNormalizer.normalizeStackTraceLengthEnv('0');

        expect(result).to.equal(0);
      });

      it('should return null for invalid string', () => {
        const result = stackTraceNormalizer.normalizeStackTraceLengthEnv('invalid');

        expect(result).to.be.null;
      });

      it('should return null for empty string', () => {
        const result = stackTraceNormalizer.normalizeStackTraceLengthEnv('');

        expect(result).to.be.null;
      });

      it('should return null for null', () => {
        const result = stackTraceNormalizer.normalizeStackTraceLengthEnv(null);

        expect(result).to.be.null;
      });

      it('should return null for undefined', () => {
        const result = stackTraceNormalizer.normalizeStackTraceLengthEnv(undefined);

        expect(result).to.be.null;
      });

      it('should handle string with leading/trailing spaces', () => {
        const result = stackTraceNormalizer.normalizeStackTraceLengthEnv('  25  ');

        expect(result).to.equal(25);
      });

      it('should return null for Infinity string', () => {
        const result = stackTraceNormalizer.normalizeStackTraceLengthEnv('Infinity');

        expect(result).to.be.null;
      });

      it('should return null for NaN string', () => {
        const result = stackTraceNormalizer.normalizeStackTraceLengthEnv('NaN');

        expect(result).to.be.null;
      });

      it('should handle very large negative string value', () => {
        const result = stackTraceNormalizer.normalizeStackTraceLengthEnv('-1000');

        expect(result).to.equal(MAX_STACK_TRACE_LENGTH);
      });

      it('should handle stackTraceLength exactly at MAX_STACK_TRACE_LENGTH', () => {
        const result = stackTraceNormalizer.normalizeStackTraceLengthEnv(String(MAX_STACK_TRACE_LENGTH));

        expect(result).to.equal(MAX_STACK_TRACE_LENGTH);
      });

      it('should handle stackTraceLength just below MAX_STACK_TRACE_LENGTH', () => {
        const result = stackTraceNormalizer.normalizeStackTraceLengthEnv(String(MAX_STACK_TRACE_LENGTH - 1));

        expect(result).to.equal(MAX_STACK_TRACE_LENGTH - 1);
      });
    });
  });
});
