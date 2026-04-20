/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('mocha');
const { expect } = require('chai');

const { normalize, normalizeExternalConfig } = require('../../../src/config/configNormalizers/disable');
const { CONFIG_SOURCES } = require('../../../src/util/constants');

function resetEnv() {
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

      expect(result).to.deep.equal({
        value: {},
        source: CONFIG_SOURCES.DEFAULT
      });
      expect(config.tracing).to.exist;
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
      expect(result.value.instrumentations).to.deep.equal(['aws-sdk', 'mongodb', 'postgres']);
      expect(result.source).to.equal(CONFIG_SOURCES.IN_CODE);
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
      expect(result.value.instrumentations).to.deep.equal([]);
      expect(result.source).to.equal(CONFIG_SOURCES.IN_CODE);
    });

    it('should handle flat disable config', () => {
      const config = {
        tracing: {
          disable: ['AWS-SDK', '  MongoDB  ', '', 'Postgres']
        }
      };

      const result = normalize(config);
      expect(result.value.instrumentations).to.deep.equal(['aws-sdk', 'mongodb', 'postgres']);
      expect(result.source).to.equal(CONFIG_SOURCES.IN_CODE);
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
      expect(result.value.groups).to.deep.equal(['logging', 'databases']);
      expect(result.source).to.equal(CONFIG_SOURCES.IN_CODE);
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
      expect(result.value.groups).to.deep.equal(['logging', 'databases', 'messaging']);
      expect(result.source).to.equal(CONFIG_SOURCES.IN_CODE);
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
      expect(result.value.groups).to.deep.equal([]);
      expect(result.source).to.equal(CONFIG_SOURCES.IN_CODE);
    });

    it('should handle mixed array of instrumentations and groups', () => {
      const config = {
        tracing: {
          disable: ['aws-sdk', 'logging', 'mongodb', 'databases']
        }
      };

      const result = normalize(config);
      expect(result).to.deep.equal({
        value: {
          instrumentations: ['aws-sdk', 'mongodb'],
          groups: ['logging', 'databases']
        },
        source: CONFIG_SOURCES.IN_CODE
      });
    });

    it('should return an empty object when disable config is an empty object', () => {
      const config = {
        tracing: {
          disable: {}
        }
      };

      const result = normalize(config);
      expect(result).to.deep.equal({
        value: {},
        source: CONFIG_SOURCES.DEFAULT
      });
    });

    it('should return an empty object if disable is null or undefined', () => {
      const config1 = { tracing: { disable: null } };
      const config2 = { tracing: { disable: undefined } };

      expect(normalize(config1)).to.deep.equal({
        value: {},
        source: CONFIG_SOURCES.DEFAULT
      });
      expect(normalize(config2)).to.deep.equal({
        value: {},
        source: CONFIG_SOURCES.DEFAULT
      });
    });

    it('should ignore non-string values in disable array', () => {
      const config = {
        tracing: {
          disable: ['aws-sdk', 123, null, undefined, {}, 'mongodb']
        }
      };

      const result = normalize(config);
      expect(result.value.instrumentations).to.deep.equal(['aws-sdk', 'mongodb']);
      expect(result.source).to.equal(CONFIG_SOURCES.IN_CODE);
    });

    it('should ignore non-string values inside disable.instrumentations', () => {
      const config = {
        tracing: {
          disable: { instrumentations: ['aws-sdk', 123, null, undefined, {}, 'mongodb'] }
        }
      };

      const result = normalize(config);
      expect(result.value.instrumentations).to.deep.equal(['aws-sdk', 'mongodb']);
      expect(result.source).to.equal(CONFIG_SOURCES.IN_CODE);
    });

    it('should return true if tracing is globally disabled (disable = true)', () => {
      const config = {
        tracing: {
          disable: true
        }
      };

      const result = normalize(config);
      expect(result).to.deep.equal({
        value: true,
        source: CONFIG_SOURCES.IN_CODE
      });
    });

    it('should return an empty object if tracing disable is set to false', () => {
      const config = {
        tracing: {
          disable: false
        }
      };

      const result = normalize(config);
      expect(result).to.deep.equal({
        value: {},
        source: CONFIG_SOURCES.DEFAULT
      });
    });
  });

  describe('Environment Variable Handling', () => {
    it('should parse "INSTANA_TRACING_DISABLE_INSTRUMENTATIONS" correctly', () => {
      process.env.INSTANA_TRACING_DISABLE_INSTRUMENTATIONS = 'aws-sdk, mongodb, postgres';

      const config = {};
      const result = normalize(config);

      expect(result.value.instrumentations).to.deep.equal(['aws-sdk', 'mongodb', 'postgres']);
      expect(result.source).to.equal(CONFIG_SOURCES.ENV);
    });

    it('should parse "INSTANA_TRACING_DISABLE" as instrumentations', () => {
      process.env.INSTANA_TRACING_DISABLE = 'aws-sdk, mongodb, postgres';

      const config = {};
      const result = normalize(config);

      expect(result.value.instrumentations).to.deep.equal(['aws-sdk', 'mongodb', 'postgres']);
      expect(result.source).to.equal(CONFIG_SOURCES.ENV);
    });

    it('should parse "INSTANA_TRACING_DISABLE_GROUPS"', () => {
      process.env.INSTANA_TRACING_DISABLE_GROUPS = 'logging, databases';

      const config = {};
      const result = normalize(config);

      expect(result.value.groups).to.deep.equal(['logging', 'databases']);
      expect(result.source).to.equal(CONFIG_SOURCES.ENV);
    });

    it('should support semicolon-separated values in environment variable', () => {
      process.env.INSTANA_TRACING_DISABLE_INSTRUMENTATIONS = 'aws-sdk;mongodb;postgres';

      const config = {};
      const result = normalize(config);

      expect(result.value.instrumentations).to.deep.equal(['aws-sdk', 'mongodb', 'postgres']);
      expect(result.source).to.equal(CONFIG_SOURCES.ENV);
    });

    it('should ignore empty or whitespace-only entries in environment variable', () => {
      process.env.INSTANA_TRACING_DISABLE_INSTRUMENTATIONS = 'aws-sdk,,mongodb, ,postgres';
      process.env.INSTANA_TRACING_DISABLE_GROUPS = 'logging,,databases, ,messaging';

      const config = {};
      const result = normalize(config);

      expect(result.value.instrumentations).to.deep.equal(['aws-sdk', 'mongodb', 'postgres']);
      expect(result.value.groups).to.deep.equal(['logging', 'databases', 'messaging']);
      expect(result.source).to.equal(CONFIG_SOURCES.ENV);
    });

    it('should combine env instrumentation and group variables', () => {
      process.env.INSTANA_TRACING_DISABLE_INSTRUMENTATIONS = 'aws-sdk,mongodb';
      process.env.INSTANA_TRACING_DISABLE_GROUPS = 'logging,databases';

      const config = {};
      const result = normalize(config);

      expect(result).to.deep.equal({
        value: {
          instrumentations: ['aws-sdk', 'mongodb'],
          groups: ['logging', 'databases']
        },
        source: CONFIG_SOURCES.ENV
      });
    });

    it('should parse mixed disable values from INSTANA_TRACING_DISABLE', () => {
      process.env.INSTANA_TRACING_DISABLE = 'aws-sdk,logging,mongodb,databases';

      const config = {};
      const result = normalize(config);

      expect(result).to.deep.equal({
        value: {
          instrumentations: ['aws-sdk', 'mongodb'],
          groups: ['logging', 'databases']
        },
        source: CONFIG_SOURCES.ENV
      });
    });

    it('should return empty object for empty env variables', () => {
      process.env.INSTANA_TRACING_DISABLE_INSTRUMENTATIONS = '';
      process.env.INSTANA_TRACING_DISABLE_GROUPS = '';

      const config = {};
      const result = normalize(config);

      expect(result).to.deep.equal({
        value: {},
        source: CONFIG_SOURCES.DEFAULT
      });
    });

    it('should return true if INSTANA_TRACING_DISABLE is "true"', () => {
      process.env.INSTANA_TRACING_DISABLE = 'true';

      const config = {};
      const result = normalize(config);

      expect(result).to.deep.equal({
        value: true,
        source: CONFIG_SOURCES.ENV
      });
    });

    it('should return empty object if INSTANA_TRACING_DISABLE is "false"', () => {
      process.env.INSTANA_TRACING_DISABLE = 'false';

      const config = {};
      const result = normalize(config);

      expect(result).to.deep.equal({
        value: {},
        source: CONFIG_SOURCES.ENV
      });
    });

    it('should give precedence to INSTANA_TRACING_DISABLE=false over config.tracing.disable=true', () => {
      process.env.INSTANA_TRACING_DISABLE = 'false';

      const config = {
        tracing: {
          disable: true
        }
      };
      const result = normalize(config);

      expect(result).to.deep.equal({
        value: {},
        source: CONFIG_SOURCES.ENV
      });
    });

    it('should give precedence to INSTANA_TRACING_DISABLE=false over config with instrumentations', () => {
      process.env.INSTANA_TRACING_DISABLE = 'false';

      const config = {
        tracing: {
          disable: {
            instrumentations: ['aws-sdk', 'mongodb']
          }
        }
      };
      const result = normalize(config);

      expect(result).to.deep.equal({
        value: {},
        source: CONFIG_SOURCES.ENV
      });
    });

    it('should give precedence to INSTANA_TRACING_DISABLE=true over other env vars', () => {
      process.env.INSTANA_TRACING_DISABLE = 'true';
      process.env.INSTANA_TRACING_DISABLE_INSTRUMENTATIONS = 'aws-sdk,mongodb';
      process.env.INSTANA_TRACING_DISABLE_GROUPS = 'logging,databases';

      const config = {};
      const result = normalize(config);

      expect(result).to.deep.equal({
        value: true,
        source: CONFIG_SOURCES.ENV
      });
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
      expect(result).to.deep.equal({
        value: {
          instrumentations: ['redis', 'console']
        },
        source: CONFIG_SOURCES.AGENT
      });
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
      expect(result.source).to.equal(CONFIG_SOURCES.AGENT);
      expect(result.value.groups).to.include('messaging');
      expect(result.value.instrumentations).to.include('kafka');
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
      expect(result.source).to.equal(CONFIG_SOURCES.AGENT);
      expect(result.value.instrumentations).to.deep.equal(['redis', '!console']);
      expect(result.value.groups).to.include('logging', '!databases');
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
      expect(result).to.deep.equal({
        value: {
          instrumentations: ['!redis', '!pg']
        },
        source: CONFIG_SOURCES.AGENT
      });
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
      expect(result).to.deep.equal({
        value: {
          instrumentations: ['redis']
        },
        source: CONFIG_SOURCES.AGENT
      });
    });
  });
});
