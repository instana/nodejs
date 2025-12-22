/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('mocha');
const { expect } = require('chai');
const sinon = require('sinon');

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
  let logger;

  beforeEach(() => {
    resetEnv();
    logger = {
      debug: sinon.stub(),
      info: sinon.stub(),
      warn: sinon.stub(),
      error: sinon.stub(),
      trace: sinon.stub()
    };
    stackTraceNormalizer.init({ logger });
  });

  afterEach(() => {
    resetEnv();
  });

  describe('normalize()', () => {
    describe('stackTrace mode', () => {
      it('should return default stack trace mode when no config is provided', () => {
        const config = {};
        const result = stackTraceNormalizer.normalize(config);

        expect(result.stackTrace).to.equal(DEFAULT_STACK_TRACE_MODE);
        expect(result.stackTraceLength).to.equal(DEFAULT_STACK_TRACE_LENGTH);
      });

      it('should accept valid stack trace mode from config (all)', () => {
        const config = {
          tracing: {
            global: {
              stackTrace: 'all'
            }
          }
        };
        const result = stackTraceNormalizer.normalize(config);

        expect(result.stackTrace).to.equal('all');
      });

      it('should accept valid stack trace mode from config (error)', () => {
        const config = {
          tracing: {
            global: {
              stackTrace: 'error'
            }
          }
        };
        const result = stackTraceNormalizer.normalize(config);

        expect(result.stackTrace).to.equal('error');
      });

      it('should accept valid stack trace mode from config (none)', () => {
        const config = {
          tracing: {
            global: {
              stackTrace: 'none'
            }
          }
        };
        const result = stackTraceNormalizer.normalize(config);

        expect(result.stackTrace).to.equal('none');
      });

      it('should normalize stack trace mode to lowercase', () => {
        const config = {
          tracing: {
            global: {
              stackTrace: 'ALL'
            }
          }
        };
        const result = stackTraceNormalizer.normalize(config);

        expect(result.stackTrace).to.equal('all');
      });

      it('should normalize mixed case stack trace mode', () => {
        const config = {
          tracing: {
            global: {
              stackTrace: 'ErRoR'
            }
          }
        };
        const result = stackTraceNormalizer.normalize(config);

        expect(result.stackTrace).to.equal('error');
      });

      it('should warn and use default for invalid stack trace mode', () => {
        const config = {
          tracing: {
            global: {
              stackTrace: 'invalid'
            }
          }
        };
        const result = stackTraceNormalizer.normalize(config);

        expect(result.stackTrace).to.equal(DEFAULT_STACK_TRACE_MODE);
        expect(logger.warn.calledOnce).to.be.true;
        expect(logger.warn.firstCall.args[0]).to.include('Invalid value for config.tracing.global.stackTrace');
      });

      it('should warn and use default for non-string stack trace mode', () => {
        const config = {
          tracing: {
            global: {
              stackTrace: 123
            }
          }
        };
        const result = stackTraceNormalizer.normalize(config);

        expect(result.stackTrace).to.equal(DEFAULT_STACK_TRACE_MODE);
        expect(logger.warn.calledOnce).to.be.true;
        expect(logger.warn.firstCall.args[0]).to.include('non-supported type');
      });

      it('should accept stack trace mode from environment variable', () => {
        process.env.INSTANA_STACK_TRACE = 'error';
        const config = {};
        const result = stackTraceNormalizer.normalize(config);

        expect(result.stackTrace).to.equal('error');
      });

      it('should normalize environment variable to lowercase', () => {
        process.env.INSTANA_STACK_TRACE = 'NONE';
        const config = {};
        const result = stackTraceNormalizer.normalize(config);

        expect(result.stackTrace).to.equal('none');
      });

      it('should warn and use default for invalid environment variable', () => {
        process.env.INSTANA_STACK_TRACE = 'invalid';
        const config = {};
        const result = stackTraceNormalizer.normalize(config);

        expect(result.stackTrace).to.equal(DEFAULT_STACK_TRACE_MODE);
        expect(logger.warn.calledOnce).to.be.true;
        expect(logger.warn.firstCall.args[0]).to.include('Invalid value for INSTANA_STACK_TRACE');
      });

      it('should prioritize config over environment variable', () => {
        process.env.INSTANA_STACK_TRACE = 'error';
        const config = {
          tracing: {
            global: {
              stackTrace: 'none'
            }
          }
        };
        const result = stackTraceNormalizer.normalize(config);

        expect(result.stackTrace).to.equal('none');
      });

      it('should use environment variable when config is invalid', () => {
        process.env.INSTANA_STACK_TRACE = 'error';
        const config = {
          tracing: {
            global: {
              stackTrace: 'invalid'
            }
          }
        };
        const result = stackTraceNormalizer.normalize(config);

        expect(result.stackTrace).to.equal('error');
      });
    });

    describe('stackTraceLength', () => {
      it('should return default stack trace length when no config is provided', () => {
        const config = {};
        const result = stackTraceNormalizer.normalize(config);

        expect(result.stackTraceLength).to.equal(DEFAULT_STACK_TRACE_LENGTH);
      });

      it('should accept valid numeric stack trace length from config', () => {
        const config = {
          tracing: {
            global: {
              stackTraceLength: 20
            }
          }
        };
        const result = stackTraceNormalizer.normalize(config);

        expect(result.stackTraceLength).to.equal(20);
      });

      it('should accept string numeric stack trace length from config', () => {
        const config = {
          tracing: {
            global: {
              stackTraceLength: '25'
            }
          }
        };
        const result = stackTraceNormalizer.normalize(config);

        expect(result.stackTraceLength).to.equal(25);
      });

      it('should round decimal values', () => {
        const config = {
          tracing: {
            global: {
              stackTraceLength: 15.7
            }
          }
        };
        const result = stackTraceNormalizer.normalize(config);

        expect(result.stackTraceLength).to.equal(16);
      });

      it('should convert negative values to positive', () => {
        const config = {
          tracing: {
            global: {
              stackTraceLength: -10
            }
          }
        };
        const result = stackTraceNormalizer.normalize(config);

        expect(result.stackTraceLength).to.equal(10);
      });

      it('should cap at MAX_STACK_TRACE_LENGTH', () => {
        const config = {
          tracing: {
            global: {
              stackTraceLength: 1000
            }
          }
        };
        const result = stackTraceNormalizer.normalize(config);

        expect(result.stackTraceLength).to.equal(MAX_STACK_TRACE_LENGTH);
      });

      it('should warn and use default for non-numeric string', () => {
        const config = {
          tracing: {
            global: {
              stackTraceLength: 'invalid'
            }
          }
        };
        const result = stackTraceNormalizer.normalize(config);

        expect(result.stackTraceLength).to.equal(DEFAULT_STACK_TRACE_LENGTH);
        expect(logger.warn.calledOnce).to.be.true;
        expect(logger.warn.firstCall.args[0]).to.include('cannot be parsed to a numerical value');
      });

      it('should warn and use default for non-supported type', () => {
        const config = {
          tracing: {
            global: {
              stackTraceLength: {}
            }
          }
        };
        const result = stackTraceNormalizer.normalize(config);

        expect(result.stackTraceLength).to.equal(DEFAULT_STACK_TRACE_LENGTH);
        expect(logger.warn.calledOnce).to.be.true;
        expect(logger.warn.firstCall.args[0]).to.include('non-supported type');
      });

      it('should accept stack trace length from INSTANA_STACK_TRACE_LENGTH env var', () => {
        process.env.INSTANA_STACK_TRACE_LENGTH = '30';
        const config = {};
        const result = stackTraceNormalizer.normalize(config);

        expect(result.stackTraceLength).to.equal(30);
      });

      it('should handle zero value', () => {
        const config = {
          tracing: {
            global: {
              stackTraceLength: 0
            }
          }
        };
        const result = stackTraceNormalizer.normalize(config);

        expect(result.stackTraceLength).to.equal(0);
      });
    });

    describe('combined config', () => {
      it('should normalize both stackTrace and stackTraceLength', () => {
        const config = {
          tracing: {
            global: {
              stackTrace: 'error',
              stackTraceLength: 20
            }
          }
        };
        const result = stackTraceNormalizer.normalize(config);

        expect(result.stackTrace).to.equal('error');
        expect(result.stackTraceLength).to.equal(20);
      });

      it('should create tracing object if not present', () => {
        const config = {};
        stackTraceNormalizer.normalize(config);

        expect(config.tracing).to.exist;
        expect(config.tracing).to.be.an('object');
      });
    });

    describe('tracing.stackTraceLength legacy config paths', () => {
      describe('stackTraceLength', () => {
        it('should accept valid stack trace length from tracing.stackTraceLength', () => {
          const config = {
            tracing: {
              stackTraceLength: 25
            }
          };
          const result = stackTraceNormalizer.normalize(config);

          expect(result.stackTraceLength).to.equal(25);
        });

        it('should prioritize tracing.global.stackTraceLength over tracing.stackTraceLength', () => {
          const config = {
            tracing: {
              global: {
                stackTraceLength: 30
              },
              stackTraceLength: 20
            }
          };
          const result = stackTraceNormalizer.normalize(config);

          expect(result.stackTraceLength).to.equal(30);
        });

        it('should fall back to tracing.stackTraceLength when tracing.global.stackTraceLength is not set', () => {
          const config = {
            tracing: {
              global: {},
              stackTraceLength: 15
            }
          };
          const result = stackTraceNormalizer.normalize(config);

          expect(result.stackTraceLength).to.equal(15);
        });

        it('should prioritize tracing.stackTraceLength over environment variable', () => {
          process.env.INSTANA_STACK_TRACE_LENGTH = '40';
          const config = {
            tracing: {
              stackTraceLength: 25
            }
          };
          const result = stackTraceNormalizer.normalize(config);

          expect(result.stackTraceLength).to.equal(25);
        });

        it('should fall back to env var when tracing.stackTraceLength is invalid', () => {
          process.env.INSTANA_STACK_TRACE_LENGTH = '35';
          const config = {
            tracing: {
              stackTraceLength: 'invalid'
            }
          };
          const result = stackTraceNormalizer.normalize(config);

          expect(result.stackTraceLength).to.equal(35);
          expect(logger.warn.calledOnce).to.be.true;
        });
      });

      describe('combined tracing config', () => {
        it('should normalize both stackTrace and stackTraceLength from tracing.global', () => {
          const config = {
            tracing: {
              global: {
                stackTrace: 'error',
                stackTraceLength: 25
              }
            }
          };
          const result = stackTraceNormalizer.normalize(config);

          expect(result.stackTrace).to.equal('error');
          expect(result.stackTraceLength).to.equal(25);
        });

        it('should handle mixed config with tracing.global and tracing direct properties', () => {
          const config = {
            tracing: {
              global: {
                stackTrace: 'error'
              },
              stackTraceLength: 20
            }
          };
          const result = stackTraceNormalizer.normalize(config);

          expect(result.stackTrace).to.equal('error');
          expect(result.stackTraceLength).to.equal(20);
        });

        it('should prioritize tracing.global for both when both levels are present', () => {
          const config = {
            tracing: {
              global: {
                stackTrace: 'none',
                stackTraceLength: 30
              },
              stackTraceLength: 10
            }
          };
          const result = stackTraceNormalizer.normalize(config);

          expect(result.stackTrace).to.equal('none');
          expect(result.stackTraceLength).to.equal(30);
        });
      });
    });
  });

  describe('normalizeAgentConfig()', () => {
    describe('stackTrace mode from agent', () => {
      it('should return null for null config', () => {
        const result = stackTraceNormalizer.normalizeAgentConfig(null);

        expect(result.stackTrace).to.be.null;
        expect(result.stackTraceLength).to.be.null;
      });

      it('should return null for undefined config', () => {
        const result = stackTraceNormalizer.normalizeAgentConfig(undefined);

        expect(result.stackTrace).to.be.null;
        expect(result.stackTraceLength).to.be.null;
      });

      it('should return null for non-object config', () => {
        const result = stackTraceNormalizer.normalizeAgentConfig('invalid');

        expect(result.stackTrace).to.be.null;
        expect(result.stackTraceLength).to.be.null;
      });

      it('should accept valid stack trace mode from agent', () => {
        const config = { 'stack-trace': 'error' };
        const result = stackTraceNormalizer.normalizeAgentConfig(config);

        expect(result.stackTrace).to.equal('error');
      });

      it('should normalize agent stack trace mode to lowercase', () => {
        const config = { 'stack-trace': 'ALL' };
        const result = stackTraceNormalizer.normalizeAgentConfig(config);

        expect(result.stackTrace).to.equal('all');
      });

      it('should return null and warn for invalid agent stack trace mode', () => {
        const config = { 'stack-trace': 'invalid' };
        const result = stackTraceNormalizer.normalizeAgentConfig(config);

        expect(result.stackTrace).to.be.null;
        expect(logger.warn.calledOnce).to.be.true;
        expect(logger.warn.firstCall.args[0]).to.include('Invalid value for stack-trace value from agent');
      });

      it('should return null when agent stackTrace is null', () => {
        const config = { 'stack-trace': null };
        const result = stackTraceNormalizer.normalizeAgentConfig(config);

        expect(result.stackTrace).to.be.null;
      });

      it('should return null when agent stackTrace is undefined', () => {
        const config = { 'stack-trace': undefined };
        const result = stackTraceNormalizer.normalizeAgentConfig(config);

        expect(result.stackTrace).to.be.null;
      });
    });

    describe('stackTraceLength from agent', () => {
      it('should accept valid numeric stack trace length from agent', () => {
        const config = { 'stack-trace-length': 20 };
        const result = stackTraceNormalizer.normalizeAgentConfig(config);

        expect(result.stackTraceLength).to.equal(20);
      });

      it('should accept string numeric stack trace length from agent', () => {
        const config = { 'stack-trace-length': '25' };
        const result = stackTraceNormalizer.normalizeAgentConfig(config);

        expect(result.stackTraceLength).to.equal(25);
      });

      it('should round decimal values from agent', () => {
        const config = { 'stack-trace-length': 15.7 };
        const result = stackTraceNormalizer.normalizeAgentConfig(config);

        expect(result.stackTraceLength).to.equal(16);
      });

      it('should convert negative values to positive from agent', () => {
        const config = { 'stack-trace-length': -10 };
        const result = stackTraceNormalizer.normalizeAgentConfig(config);

        expect(result.stackTraceLength).to.equal(10);
      });

      it('should cap at MAX_STACK_TRACE_LENGTH from agent', () => {
        const config = { 'stack-trace-length': 1000 };
        const result = stackTraceNormalizer.normalizeAgentConfig(config);

        expect(result.stackTraceLength).to.equal(MAX_STACK_TRACE_LENGTH);
      });

      it('should return null and warn for invalid agent stack trace length', () => {
        const config = { 'stack-trace-length': 'invalid' };
        const result = stackTraceNormalizer.normalizeAgentConfig(config);

        expect(result.stackTraceLength).to.be.null;
        expect(logger.warn.calledOnce).to.be.true;
        expect(logger.warn.firstCall.args[0]).to.include(
          'The value of stack-trace-length value from agent ("invalid") cannot be parsed to a numerical value'
        );
      });

      it('should return null when agent stackTraceLength is null', () => {
        const config = { 'stack-trace-length': null };
        const result = stackTraceNormalizer.normalizeAgentConfig(config);

        expect(result.stackTraceLength).to.be.null;
      });

      it('should return null when agent stackTraceLength is undefined', () => {
        const config = { 'stack-trace-length': undefined };
        const result = stackTraceNormalizer.normalizeAgentConfig(config);

        expect(result.stackTraceLength).to.be.null;
      });

      it('should handle zero value from agent', () => {
        const config = { 'stack-trace-length': 0 };
        const result = stackTraceNormalizer.normalizeAgentConfig(config);

        expect(result.stackTraceLength).to.equal(0);
      });
    });

    describe('combined agent config', () => {
      it('should normalize both stackTrace and stackTraceLength from agent', () => {
        const config = {
          'stack-trace': 'error',
          'stack-trace-length': 20
        };
        const result = stackTraceNormalizer.normalizeAgentConfig(config);

        expect(result.stackTrace).to.equal('error');
        expect(result.stackTraceLength).to.equal(20);
      });

      it('should handle partial agent config', () => {
        const config = { 'stack-trace': 'none' };
        const result = stackTraceNormalizer.normalizeAgentConfig(config);

        expect(result.stackTrace).to.equal('none');
        expect(result.stackTraceLength).to.be.null;
      });

      it('should handle empty agent config object', () => {
        const config = {};
        const result = stackTraceNormalizer.normalizeAgentConfig(config);

        expect(result.stackTrace).to.be.null;
        expect(result.stackTraceLength).to.be.null;
      });

      it('should handle agent config with both valid values', () => {
        const config = {
          'stack-trace': 'error',
          'stack-trace-length': 30
        };
        const result = stackTraceNormalizer.normalizeAgentConfig(config);

        expect(result.stackTrace).to.equal('error');
        expect(result.stackTraceLength).to.equal(30);
      });

      it('should handle agent config with one valid and one invalid value', () => {
        const config = {
          'stack-trace': 'error',
          'stack-trace-length': 'not-a-number'
        };
        const result = stackTraceNormalizer.normalizeAgentConfig(config);

        expect(result.stackTrace).to.equal('error');
        expect(result.stackTraceLength).to.be.null;
        expect(logger.warn.calledOnce).to.be.true;
      });

      it('should handle non-string agent stackTrace that is not a valid mode', () => {
        const config = { 'stack-trace': 123 };
        const result = stackTraceNormalizer.normalizeAgentConfig(config);

        expect(result.stackTrace).to.be.null;
        expect(logger.warn.calledOnce).to.be.true;
      });

      it('should handle Infinity for agent stackTraceLength', () => {
        const config = { 'stack-trace-length': Infinity };
        const result = stackTraceNormalizer.normalizeAgentConfig(config);

        expect(result.stackTraceLength).to.be.null;
        expect(logger.warn.calledOnce).to.be.true;
      });

      it('should handle NaN for agent stackTraceLength', () => {
        const config = { 'stack-trace-length': NaN };
        const result = stackTraceNormalizer.normalizeAgentConfig(config);

        expect(result.stackTraceLength).to.be.null;
        expect(logger.warn.calledOnce).to.be.true;
      });

      it('should handle object for agent stackTraceLength', () => {
        const config = { 'stack-trace-length': {} };
        const result = stackTraceNormalizer.normalizeAgentConfig(config);

        expect(result.stackTraceLength).to.be.null;
        expect(logger.warn.calledOnce).to.be.true;
      });
    });
  });

  describe('init()', () => {
    it('should initialize logger from config', () => {
      const mockLogger = {
        debug: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub()
      };
      stackTraceNormalizer.init({ logger: mockLogger });

      // Test that logger is used by triggering a warning
      const config = {
        tracing: {
          stackTrace: 'invalid'
        }
      };
      stackTraceNormalizer.normalize(config);

      expect(mockLogger.warn.calledOnce).to.be.true;
    });
  });

  describe('edge cases and boundary conditions', () => {
    it('should handle null config in normalize', () => {
      const result = stackTraceNormalizer.normalize(null);

      expect(result.stackTrace).to.equal(DEFAULT_STACK_TRACE_MODE);
      expect(result.stackTraceLength).to.equal(DEFAULT_STACK_TRACE_LENGTH);
    });

    it('should handle undefined config in normalize', () => {
      const result = stackTraceNormalizer.normalize(undefined);

      expect(result.stackTrace).to.equal(DEFAULT_STACK_TRACE_MODE);
      expect(result.stackTraceLength).to.equal(DEFAULT_STACK_TRACE_LENGTH);
    });

    it('should handle config with null tracing', () => {
      const config = { tracing: null };
      const result = stackTraceNormalizer.normalize(config);

      expect(result.stackTrace).to.equal(DEFAULT_STACK_TRACE_MODE);
      expect(result.stackTraceLength).to.equal(DEFAULT_STACK_TRACE_LENGTH);
    });

    it('should handle stackTraceLength exactly at MAX_STACK_TRACE_LENGTH', () => {
      const config = {
        tracing: {
          stackTraceLength: MAX_STACK_TRACE_LENGTH
        }
      };
      const result = stackTraceNormalizer.normalize(config);

      expect(result.stackTraceLength).to.equal(MAX_STACK_TRACE_LENGTH);
    });

    it('should handle stackTraceLength just below MAX_STACK_TRACE_LENGTH', () => {
      const config = {
        tracing: {
          stackTraceLength: MAX_STACK_TRACE_LENGTH - 1
        }
      };
      const result = stackTraceNormalizer.normalize(config);

      expect(result.stackTraceLength).to.equal(MAX_STACK_TRACE_LENGTH - 1);
    });

    it('should handle very large negative stackTraceLength', () => {
      const config = {
        tracing: {
          stackTraceLength: -1000
        }
      };
      const result = stackTraceNormalizer.normalize(config);

      expect(result.stackTraceLength).to.equal(MAX_STACK_TRACE_LENGTH);
    });

    it('should handle decimal string for stackTraceLength', () => {
      const config = {
        tracing: {
          stackTraceLength: '15.8'
        }
      };
      const result = stackTraceNormalizer.normalize(config);

      expect(result.stackTraceLength).to.equal(15);
    });

    it('should handle string with leading/trailing spaces for stackTraceLength', () => {
      const config = {
        tracing: {
          stackTraceLength: '  20  '
        }
      };
      const result = stackTraceNormalizer.normalize(config);

      expect(result.stackTraceLength).to.equal(20);
    });

    it('should handle boolean false for stackTraceLength', () => {
      const config = {
        tracing: {
          stackTraceLength: false
        }
      };
      const result = stackTraceNormalizer.normalize(config);

      expect(result.stackTraceLength).to.equal(DEFAULT_STACK_TRACE_LENGTH);
      expect(logger.warn.calledOnce).to.be.true;
    });

    it('should handle boolean true for stackTraceLength', () => {
      const config = {
        tracing: {
          stackTraceLength: true
        }
      };
      const result = stackTraceNormalizer.normalize(config);

      expect(result.stackTraceLength).to.equal(DEFAULT_STACK_TRACE_LENGTH);
      expect(logger.warn.calledOnce).to.be.true;
    });

    it('should handle array for stackTraceLength', () => {
      const config = {
        tracing: {
          stackTraceLength: [10]
        }
      };
      const result = stackTraceNormalizer.normalize(config);

      expect(result.stackTraceLength).to.equal(DEFAULT_STACK_TRACE_LENGTH);
      expect(logger.warn.calledOnce).to.be.true;
    });

    it('should handle empty string for stackTrace mode', () => {
      const config = {
        tracing: {
          stackTrace: ''
        }
      };
      const result = stackTraceNormalizer.normalize(config);

      expect(result.stackTrace).to.equal(DEFAULT_STACK_TRACE_MODE);
    });

    it('should handle whitespace-only string for stackTrace mode', () => {
      const config = {
        tracing: {
          global: {
            stackTrace: '   '
          }
        }
      };
      const result = stackTraceNormalizer.normalize(config);

      expect(result.stackTrace).to.equal(DEFAULT_STACK_TRACE_MODE);
      expect(logger.warn.calledOnce).to.be.true;
    });

    it('should handle boolean for stackTrace mode', () => {
      const config = {
        tracing: {
          global: {
            stackTrace: true
          }
        }
      };
      const result = stackTraceNormalizer.normalize(config);

      expect(result.stackTrace).to.equal(DEFAULT_STACK_TRACE_MODE);
      expect(logger.warn.calledOnce).to.be.true;
    });

    it('should handle array for stackTrace mode', () => {
      const config = {
        tracing: {
          global: {
            stackTrace: ['error']
          }
        }
      };
      const result = stackTraceNormalizer.normalize(config);

      expect(result.stackTrace).to.equal(DEFAULT_STACK_TRACE_MODE);
      expect(logger.warn.calledOnce).to.be.true;
    });

    it('should handle object for stackTrace mode', () => {
      const config = {
        tracing: {
          global: {
            stackTrace: { mode: 'error' }
          }
        }
      };
      const result = stackTraceNormalizer.normalize(config);

      expect(result.stackTrace).to.equal(DEFAULT_STACK_TRACE_MODE);
      expect(logger.warn.calledOnce).to.be.true;
    });
  });
});
