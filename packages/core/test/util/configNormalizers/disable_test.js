/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('mocha');
const { expect } = require('chai');

const { normalize, normalizeExternalConfig } = require('../../../src/util/configNormalizers/disable');
const { truncate } = require('lodash');

function resetEnv() {
  delete process.env.INSTANA_TRACING_DISABLE_INSTRUMENTATIONS;
  delete process.env.INSTANA_DISABLED_TRACERS;
  delete process.env.INSTANA_TRACING_DISABLE;
}

describe('util.configNormalizers.disable', () => {
  beforeEach(() => {
    resetEnv();
  });

  afterEach(() => {
    resetEnv();
  });

  describe('normalize()', () => {
    it('should handle empty config', () => {
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

    it('should prioritize "disable" when both "disabledTracers" and "disable" properties are defined', () => {
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

    it('should normalize library names to lowercase and trim whitespace', () => {
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

    it('should support group names', () => {
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

    it('should normalize group names to lowercase and trim whitespace', () => {
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

    it('should handle empty disable config object', () => {
      const config = {
        tracing: {
          disable: {}
        }
      };

      const result = normalize(config);
      expect(result).to.deep.equal({});
    });

    it('should handle null disable config', () => {
      const config = {
        tracing: {
          disable: null
        }
      };

      const result = normalize(config);
      expect(result).to.deep.equal({});
    });

    it('should handle undefined disable config', () => {
      const config = {
        tracing: {
          disable: undefined
        }
      };

      const result = normalize(config);
      expect(result).to.deep.equal({});
    });

    it('should handle non-string values in disable array config', () => {
      const config = {
        tracing: {
          disable: ['aws-sdk', 123, null, undefined, {}, 'mongodb']
        }
      };

      const result = normalize(config);
      expect(result.instrumentations).to.deep.equal(['aws-sdk', 'mongodb']);
    });

    it('should handle non-string values in config', () => {
      const config = {
        tracing: {
          disable: { instrumentations: ['aws-sdk', 123, null, undefined, {}, 'mongodb'] }
        }
      };

      const result = normalize(config);
      expect(result.instrumentations).to.deep.equal(['aws-sdk', 'mongodb']);
    });

    it('should return true when tracing is globally disabled via config (disable = true)', () => {
      const config = {
        tracing: {
          disable: true
        }
      };

      const result = normalize(config);
      expect(result).to.deep.equal(true);
    });

    it('should return an empty object when global tracing disable is set to false', () => {
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

    it('should parse "INSTANA_TRACING_DISABLE" correctly', () => {
      process.env.INSTANA_TRACING_DISABLE = 'aws-sdk, mongodb, postgres';

      const config = {};
      const result = normalize(config);

      expect(result.instrumentations).to.deep.equal(['aws-sdk', 'mongodb', 'postgres']);
    });

    it('should parse "INSTANA_TRACING_DISABLE_GROUPS" correctly', () => {
      process.env.INSTANA_TRACING_DISABLE_GROUPS = 'logging, databases';

      const config = {};
      const result = normalize(config);

      expect(result.groups).to.deep.equal(['logging', 'databases']);
    });

    it('should fallback to "INSTANA_DISABLED_TRACERS"', () => {
      process.env.INSTANA_DISABLED_TRACERS = 'redis, mysql';

      const config = {};
      const result = normalize(config);

      expect(result.instrumentations).to.deep.equal(['redis', 'mysql']);
    });

    it('should prioritize "INSTANA_TRACING_DISABLE_INSTRUMENTATIONS" over deprecated variable', () => {
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

      const config = {};
      const result = normalize(config);

      expect(result.instrumentations).to.deep.equal(['aws-sdk', 'mongodb', 'postgres']);
    });
    it('should ignore empty or whitespace-only entries in environment variable', () => {
      process.env.INSTANA_TRACING_DISABLE_GROUPS = 'logging,,databases, ,messaging';

      const config = {};
      const result = normalize(config);

      expect(result.groups).to.deep.equal(['logging', 'databases', 'messaging']);
    });

    it('should handle mixed environment variables', () => {
      process.env.INSTANA_TRACING_DISABLE_INSTRUMENTATIONS = 'aws-sdk,mongodb';
      process.env.INSTANA_TRACING_DISABLE_GROUPS = 'logging,databases';

      const config = {};
      const result = normalize(config);

      expect(result).to.deep.equal({
        instrumentations: ['aws-sdk', 'mongodb'],
        groups: ['logging', 'databases']
      });
    });

    it('should handle INSTANA_TRACING_DISABLE with mixed groups and instrumentations', () => {
      process.env.INSTANA_TRACING_DISABLE = 'aws-sdk,logging,mongodb,databases';

      const config = {};
      const result = normalize(config);

      expect(result).to.deep.equal({
        instrumentations: ['aws-sdk', 'mongodb'],
        groups: ['logging', 'databases']
      });
    });

    it('should handle empty string in environment variables', () => {
      process.env.INSTANA_TRACING_DISABLE_INSTRUMENTATIONS = '';
      process.env.INSTANA_TRACING_DISABLE_GROUPS = '';

      const config = {};
      const result = normalize(config);

      expect(result).to.deep.equal({});
    });

    it('should return true when INSTANA_TRACING_DISABLE is set to "true"', () => {
      process.env.INSTANA_TRACING_DISABLE = 'true';

      const config = {};
      const result = normalize(config);

      expect(result).to.deep.equal(true);
    });

    it('should return an empty object when INSTANA_TRACING_DISABLE is set to "false"', () => {
      process.env.INSTANA_TRACING_DISABLE = 'false';

      const config = {};
      const result = normalize(config);

      expect(result).to.deep.equal({});
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

    it('should categorize known groups from object entries', () => {
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

    it('should handle config with true/false values', () => {
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

    it('should handle if all entries set to false', () => {
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

    it('should ignore non-boolean values in object config', () => {
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
