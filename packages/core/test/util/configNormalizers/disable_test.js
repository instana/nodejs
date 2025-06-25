/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('mocha');
const { expect } = require('chai');

const { normalize } = require('../../../src/util/configNormalizers/disable');

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

    it('should support category names', () => {
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

    it('should normalize category names to lowercase and trim whitespace', () => {
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
  });
});
