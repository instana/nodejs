/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('mocha');
const { expect } = require('chai');

const { normalize } = require('../../../src/util/configNormalizers/disable');

function resetEnv() {
  delete process.env.INSTANA_TRACING_DISABLE_LIBRARIES;
  delete process.env.INSTANA_DISABLED_TRACERS;
  delete process.env.INSTANA_TRACING_DISABLE_CATEGORIES;
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

      expect(result).to.deep.equal({ libraries: [] });
      expect(config.tracing).to.exist;
    });

    it('should handle deprecated "disabledTracers" to "disable.libraries"', () => {
      const config = {
        tracing: {
          disabledTracers: ['AWS-SDK', 'mongodb']
        }
      };

      const result = normalize(config);

      expect(result).to.deep.equal({
        libraries: ['aws-sdk', 'mongodb']
      });
      expect(config.tracing.disabledTracers).to.be.undefined;
    });

    it('should prioritize "disable" when both "disabledTracers" and "disable" properties are defined', () => {
      const config = {
        tracing: {
          disabledTracers: ['AWS-SDK'],
          disable: {
            libraries: ['redis']
          }
        }
      };

      const result = normalize(config);
      expect(result.libraries).to.deep.equal(['redis']);
    });

    it('should normalize library names to lowercase and trim whitespace', () => {
      const config = {
        tracing: {
          disable: {
            libraries: ['AWS-SDK', '  MongoDB  ', '', 'Postgres']
          }
        }
      };

      const result = normalize(config);
      expect(result.libraries).to.deep.equal(['aws-sdk', 'mongodb', 'postgres']);
    });

    it('should handle non-array "libraries" input gracefully', () => {
      const config = {
        tracing: {
          disable: {
            libraries: 'aws-sdk'
          }
        }
      };

      const result = normalize(config);
      expect(result.libraries).to.deep.equal([]);
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
  });

  describe('Environment Variable Handling', () => {
    it('should parse "INSTANA_TRACING_DISABLE_LIBRARIES" correctly', () => {
      process.env.INSTANA_TRACING_DISABLE_LIBRARIES = 'aws-sdk, mongodb, postgres';

      const config = {};
      const result = normalize(config);

      expect(result.libraries).to.deep.equal(['aws-sdk', 'mongodb', 'postgres']);
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

      expect(result.libraries).to.deep.equal(['redis', 'mysql']);
    });

    it('should prioritize "INSTANA_TRACING_DISABLE_LIBRARIES" over deprecated variable', () => {
      process.env.INSTANA_TRACING_DISABLE_LIBRARIES = 'aws-sdk';
      process.env.INSTANA_DISABLED_TRACERS = 'redis';

      const config = {};
      const result = normalize(config);

      expect(result.libraries).to.deep.equal(['aws-sdk']);
    });

    it('should support semicolon-separated values in environment variable', () => {
      process.env.INSTANA_TRACING_DISABLE_LIBRARIES = 'aws-sdk;mongodb;postgres';

      const config = {};
      const result = normalize(config);

      expect(result.libraries).to.deep.equal(['aws-sdk', 'mongodb', 'postgres']);
    });

    it('should ignore empty or whitespace-only entries in environment variable', () => {
      process.env.INSTANA_TRACING_DISABLE_LIBRARIES = 'aws-sdk,,mongodb, ,postgres';

      const config = {};
      const result = normalize(config);

      expect(result.libraries).to.deep.equal(['aws-sdk', 'mongodb', 'postgres']);
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
  });
});
