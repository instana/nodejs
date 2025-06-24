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
  });

  describe('Environment Variable Handling', () => {
    it('should parse "INSTANA_TRACING_DISABLE_LIBRARIES" correctly', () => {
      process.env.INSTANA_TRACING_DISABLE_LIBRARIES = 'aws-sdk, mongodb, postgres';

      const config = {};
      const result = normalize(config);

      expect(result.libraries).to.deep.equal(['aws-sdk', 'mongodb', 'postgres']);
    });

    it('should fallback to "INSTANA_DISABLED_TRACERS" and issue a deprecation warning', () => {
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
  });
});
