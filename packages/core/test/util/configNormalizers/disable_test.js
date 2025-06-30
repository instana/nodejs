/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('mocha');
const { expect } = require('chai');

const { normalize, normalizeExternalConfig } = require('../../../src/util/configNormalizers/disable');

function resetEnv() {
  delete process.env.INSTANA_DISABLED_TRACERS;
  delete process.env.INSTANA_TRACING_DISABLE;
  delete process.env.INSTANA_TRACING_DISABLE_INSTRUMENTATIONS;
  delete process.env.INSTANA_TRACING_DISABLE_GROUPS;
}

describe('util.configNormalizers.disable', () => {
  beforeEach(() => {
    resetEnv();
  });

  afterEach(() => {
    resetEnv();
  });

  describe('normalize()', () => {
    it('should handle an empty config object', () => {
      const config = {};
      const result = normalize(config);

      expect(result).to.deep.equal({});
      expect(config.tracing).to.exist;
    });

    it('should handle deprecated "disabledTracers" to "disable.instrumentations"', () => {
      const config = {
        tracing: {
          disabledTracers: ['AWS-SDK', 'mongodb']
        }
      };

      const result = normalize(config);

      expect(result).to.deep.equal({
        instrumentations: ['aws-sdk', 'mongodb']
      });
      expect(config.tracing.disabledTracers).to.be.undefined;
    });

    it('should prioritize "disable" when both "disabledTracers" and "disable" are defined', () => {
      const config = {
        tracing: {
          disabledTracers: ['AWS-SDK'],
          disable: {
            instrumentations: ['redis']
          }
        }
      };

      const result = normalize(config);
      expect(result.instrumentations).to.deep.equal(['redis']);
    });

    it('should normalize instrumentation names: lowercase and trim whitespace', () => {
      const config = {
        tracing: {
          disable: {
            instrumentations: ['AWS-SDK', '  MongoDB  ', '', 'Postgres']
          }
        }
      };

      const result = normalize(config);
      expect(result.instrumentations).to.deep.equal(['aws-sdk', 'mongodb', 'postgres']);
    });

    it('should handle non-array "instrumentations" input gracefully', () => {
      const config = {
        tracing: {
          disable: {
            instrumentations: 'aws-sdk'
          }
        }
      };

      const result = normalize(config);
      expect(result.instrumentations).to.deep.equal([]);
    });

    it('should handle flat disable config', () => {
      const config = {
        tracing: {
          disable: ['AWS-SDK', '  MongoDB  ', '', 'Postgres']
        }
      };

      const result = normalize(config);
      expect(result.instrumentations).to.deep.equal(['aws-sdk', 'mongodb', 'postgres']);
    });

    it('should support disabling by group names', () => {
      const config = {
        tracing: {
          disable: {
            groups: ['logging', 'databases']
          }
        }
      };

      const result = normalize(config);
      expect(result.groups).to.deep.equal(['logging', 'databases']);
    });

    it('should normalize group names: lowercase and trim whitespace', () => {
      const config = {
        tracing: {
          disable: {
            groups: ['LOGGING', '  DATABASES  ', '', ' MESSAGING ']
          }
        }
      };

      const result = normalize(config);
      expect(result.groups).to.deep.equal(['logging', 'databases', 'messaging']);
    });

    it('should handle non-array "groups" input gracefully', () => {
      const config = {
        tracing: {
          disable: {
            groups: 'logging'
          }
        }
      };

      const result = normalize(config);
      expect(result.groups).to.deep.equal([]);
    });

    it('should handle mixed array of instrumentations and groups', () => {
      const config = {
        tracing: {
          disable: ['aws-sdk', 'logging', 'mongodb', 'databases']
        }
      };

      const result = normalize(config);
      expect(result).to.deep.equal({
        instrumentations: ['aws-sdk', 'mongodb'],
        groups: ['logging', 'databases']
      });
    });

    it('should return an empty object when disable config is an empty object', () => {
      const config = {
        tracing: {
          disable: {}
        }
      };

      const result = normalize(config);
      expect(result).to.deep.equal({});
    });

    it('should return an empty object if disable is null or undefined', () => {
      const config1 = { tracing: { disable: null } };
      const config2 = { tracing: { disable: undefined } };

      expect(normalize(config1)).to.deep.equal({});
      expect(normalize(config2)).to.deep.equal({});
    });

    it('should ignore non-string values in disable array', () => {
      const config = {
        tracing: {
          disable: ['aws-sdk', 123, null, undefined, {}, 'mongodb']
        }
      };

      const result = normalize(config);
      expect(result.instrumentations).to.deep.equal(['aws-sdk', 'mongodb']);
    });

    it('should ignore non-string values inside disable.instrumentations', () => {
      const config = {
        tracing: {
          disable: { instrumentations: ['aws-sdk', 123, null, undefined, {}, 'mongodb'] }
        }
      };

      const result = normalize(config);
      expect(result.instrumentations).to.deep.equal(['aws-sdk', 'mongodb']);
    });

    it('should return true if tracing is globally disabled (disable = true)', () => {
      const config = {
        tracing: {
          disable: true
        }
      };

      const result = normalize(config);
      expect(result).to.equal(true);
    });

    it('should return an empty object if tracing disable is set to false', () => {
      const config = {
        tracing: {
          disable: false
        }
      };

      const result = normalize(config);
      expect(result).to.deep.equal({});
    });
  });

  describe('Environment Variable Handling', () => {
    it('should parse "INSTANA_TRACING_DISABLE_INSTRUMENTATIONS" correctly', () => {
      process.env.INSTANA_TRACING_DISABLE_INSTRUMENTATIONS = 'aws-sdk, mongodb, postgres';

      const config = {};
      const result = normalize(config);

      expect(result.instrumentations).to.deep.equal(['aws-sdk', 'mongodb', 'postgres']);
    });

    it('should parse "INSTANA_TRACING_DISABLE" as instrumentations', () => {
      process.env.INSTANA_TRACING_DISABLE = 'aws-sdk, mongodb, postgres';

      const config = {};
      const result = normalize(config);

      expect(result.instrumentations).to.deep.equal(['aws-sdk', 'mongodb', 'postgres']);
    });

    it('should parse "INSTANA_TRACING_DISABLE_GROUPS"', () => {
      process.env.INSTANA_TRACING_DISABLE_GROUPS = 'logging, databases';

      const config = {};
      const result = normalize(config);

      expect(result.groups).to.deep.equal(['logging', 'databases']);
    });

    it('should fallback to deprected "INSTANA_DISABLED_TRACERS"', () => {
      process.env.INSTANA_DISABLED_TRACERS = 'redis, mysql';

      const config = {};
      const result = normalize(config);

      expect(result.instrumentations).to.deep.equal(['redis', 'mysql']);
    });

    it('should prioritize "INSTANA_TRACING_DISABLE_INSTRUMENTATIONS" over "INSTANA_DISABLED_TRACERS"', () => {
      process.env.INSTANA_TRACING_DISABLE_INSTRUMENTATIONS = 'aws-sdk';
      process.env.INSTANA_DISABLED_TRACERS = 'redis';

      const config = {};
      const result = normalize(config);

      expect(result.instrumentations).to.deep.equal(['aws-sdk']);
    });

    it('should support semicolon-separated values in environment variable', () => {
      process.env.INSTANA_TRACING_DISABLE_INSTRUMENTATIONS = 'aws-sdk;mongodb;postgres';

      const config = {};
      const result = normalize(config);

      expect(result.instrumentations).to.deep.equal(['aws-sdk', 'mongodb', 'postgres']);
    });

    it('should ignore empty or whitespace-only entries in environment variable', () => {
      process.env.INSTANA_TRACING_DISABLE_INSTRUMENTATIONS = 'aws-sdk,,mongodb, ,postgres';
      process.env.INSTANA_TRACING_DISABLE_GROUPS = 'logging,,databases, ,messaging';

      const config = {};
      const result = normalize(config);

      expect(result.instrumentations).to.deep.equal(['aws-sdk', 'mongodb', 'postgres']);
      expect(result.groups).to.deep.equal(['logging', 'databases', 'messaging']);
    });

    it('should combine env instrumentation and group variables', () => {
      process.env.INSTANA_TRACING_DISABLE_INSTRUMENTATIONS = 'aws-sdk,mongodb';
      process.env.INSTANA_TRACING_DISABLE_GROUPS = 'logging,databases';

      const config = {};
      const result = normalize(config);

      expect(result).to.deep.equal({
        instrumentations: ['aws-sdk', 'mongodb'],
        groups: ['logging', 'databases']
      });
    });

    it('should parse mixed disable values from INSTANA_TRACING_DISABLE', () => {
      process.env.INSTANA_TRACING_DISABLE = 'aws-sdk,logging,mongodb,databases';

      const config = {};
      const result = normalize(config);

      expect(result).to.deep.equal({
        instrumentations: ['aws-sdk', 'mongodb'],
        groups: ['logging', 'databases']
      });
    });

    it('should return empty object for empty env variables', () => {
      process.env.INSTANA_TRACING_DISABLE_INSTRUMENTATIONS = '';
      process.env.INSTANA_TRACING_DISABLE_GROUPS = '';

      const config = {};
      const result = normalize(config);

      expect(result).to.deep.equal({});
    });

    it('should return true if INSTANA_TRACING_DISABLE is "true"', () => {
      process.env.INSTANA_TRACING_DISABLE = 'true';

      const config = {};
      const result = normalize(config);

      expect(result).to.equal(true);
    });

    it('should return empty object if INSTANA_TRACING_DISABLE is "false"', () => {
      process.env.INSTANA_TRACING_DISABLE = 'false';

      const config = {};
      const result = normalize(config);

      expect(result).to.deep.equal({});
    });

    it('should give precedence to INSTANA_TRACING_DISABLE=true over other env vars', () => {
      process.env.INSTANA_TRACING_DISABLE = 'true';
      process.env.INSTANA_TRACING_DISABLE_INSTRUMENTATIONS = 'aws-sdk,mongodb';
      process.env.INSTANA_TRACING_DISABLE_GROUPS = 'logging,databases';

      const config = {};
      const result = normalize(config);

      expect(result).to.equal(true);
    });
  });

  describe('config from agent', () => {
    it('should handle config with true values', () => {
      const config = {
        tracing: {
          disable: {
            redis: true,
            console: true
          }
        }
      };

      const result = normalizeExternalConfig(config);
      expect(result.instrumentations).to.deep.equal(['redis', 'console']);
    });

    it('should correctly categorize known group names', () => {
      const config = {
        tracing: {
          disable: {
            messaging: true,
            kafka: true
          }
        }
      };

      const result = normalizeExternalConfig(config);
      expect(result.groups).to.include('messaging');
      expect(result.instrumentations).to.include('kafka');
    });

    it('should represent false values with negated names', () => {
      const config = {
        tracing: {
          disable: {
            logging: true,
            redis: true,
            console: false,
            databases: false
          }
        }
      };

      const result = normalizeExternalConfig(config);
      expect(result.instrumentations).to.deep.equal(['redis', '!console']);
      expect(result.groups).to.include('logging', '!databases');
    });

    it('should return negated names if all values are false', () => {
      const config = {
        tracing: {
          disable: {
            redis: false,
            pg: false
          }
        }
      };

      const result = normalizeExternalConfig(config);
      expect(result.instrumentations).to.deep.equal(['!redis', '!pg']);
    });

    it('should ignore non-boolean entries in config object', () => {
      const config = {
        tracing: {
          disable: {
            redis: true,
            pg: 'nope',
            mysql: null
          }
        }
      };

      const result = normalizeExternalConfig(config);
      expect(result.instrumentations).to.deep.equal(['redis']);
    });
  });
});
