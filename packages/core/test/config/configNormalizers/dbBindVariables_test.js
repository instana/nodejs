/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { expect } = require('chai');
const { createFakeLogger } = require('../../test_util');

const dbBindVariables = require('../../../src/config/normalizers/dbBindVariables');
const coreConfig = require('../../../src/config');

describe('config.normalizers.dbBindVariables', function () {
  before(function () {
    coreConfig.init(createFakeLogger());
  });

  beforeEach(resetEnv);
  afterEach(resetEnv);

  function resetEnv() {
    delete process.env.INSTANA_TRACING_DB_BIND_VARIABLES_DISABLE;
    delete process.env.INSTANA_TRACING_DB_BIND_VARIABLES_ALLOWED_COLUMNS;
  }

  describe('fromAgent', function () {
    it('should return null for null or non-object input', function () {
      expect(dbBindVariables.fromAgent(null)).to.equal(null);
      expect(dbBindVariables.fromAgent(undefined)).to.equal(null);
      expect(dbBindVariables.fromAgent('string')).to.equal(null);
      expect(dbBindVariables.fromAgent(42)).to.equal(null);
    });

    it('should return defaults for an empty object (no recognized keys)', function () {
      expect(dbBindVariables.fromAgent({})).to.deep.equal({ disable: true, allowedColumns: [] });
    });

    it('should parse disable=true from agent', function () {
      const result = dbBindVariables.fromAgent({ disable: true });
      expect(result).to.deep.equal({ disable: true, allowedColumns: [] });
    });

    it('should parse disable=false from agent', function () {
      const result = dbBindVariables.fromAgent({ disable: false });
      expect(result).to.deep.equal({ disable: false, allowedColumns: [] });
    });

    it('should parse allowed-columns from agent', function () {
      const result = dbBindVariables.fromAgent({ disable: false, 'allowed-columns': ['order_id', 'username'] });
      expect(result).to.deep.equal({ disable: false, allowedColumns: ['order_id', 'username'] });
    });

    it('should trim whitespace from allowed-columns entries', function () {
      const result = dbBindVariables.fromAgent({ 'allowed-columns': [' order_id ', 'username '] });
      expect(result.allowedColumns).to.deep.equal(['order_id', 'username']);
    });

    it('should filter out blank allowed-columns entries', function () {
      const result = dbBindVariables.fromAgent({ 'allowed-columns': ['order_id', '', '  ', 'username'] });
      expect(result.allowedColumns).to.deep.equal(['order_id', 'username']);
    });

    it('should ignore non-boolean disable values and return defaults', function () {
      const result = dbBindVariables.fromAgent({ disable: 'yes' });
      // 'disable' is invalid → silently ignored, allowedColumns stays at default
      expect(result).to.deep.equal({ disable: true, allowedColumns: [] });
    });
  });

  describe('coreConfig.normalize integration', function () {
    it('should apply default dbBindVariables when nothing is configured', function () {
      const config = coreConfig.normalize();
      expect(config.tracing.dbBindVariables).to.deep.equal({ disable: true, allowedColumns: [] });
    });

    it('should apply in-code dbBindVariables', function () {
      const config = coreConfig.normalize({
        userConfig: { tracing: { dbBindVariables: { disable: false, allowedColumns: ['order_id'] } } }
      });
      expect(config.tracing.dbBindVariables).to.deep.equal({ disable: false, allowedColumns: ['order_id'] });
    });

    it('should prefer env vars over in-code config', function () {
      process.env.INSTANA_TRACING_DB_BIND_VARIABLES_DISABLE = 'true';
      process.env.INSTANA_TRACING_DB_BIND_VARIABLES_ALLOWED_COLUMNS = 'env_col';
      const config = coreConfig.normalize({
        userConfig: { tracing: { dbBindVariables: { disable: false, allowedColumns: ['incode_col'] } } }
      });
      expect(config.tracing.dbBindVariables).to.deep.equal({ disable: true, allowedColumns: ['env_col'] });
    });

    it('should fall back to default disable but parse a string allowedColumns via in-code config', function () {
      const config = coreConfig.normalize({
        userConfig: { tracing: { dbBindVariables: { disable: 'not-a-bool', allowedColumns: 'not-an-array' } } }
      });
      expect(config.tracing.dbBindVariables).to.deep.equal({ disable: true, allowedColumns: ['not-an-array'] });
    });

    it('should use default allowedColumns when only disable is provided in-code', function () {
      const config = coreConfig.normalize({
        userConfig: { tracing: { dbBindVariables: { disable: false } } }
      });
      expect(config.tracing.dbBindVariables).to.deep.equal({ disable: false, allowedColumns: [] });
    });

    it('should trim and filter allowedColumns supplied via in-code config', function () {
      const config = coreConfig.normalize({
        userConfig: { tracing: { dbBindVariables: { allowedColumns: [' col_a ', '', '  ', 'col_b'] } } }
      });
      expect(config.tracing.dbBindVariables).to.deep.equal({ disable: true, allowedColumns: ['col_a', 'col_b'] });
    });

    it('should trim and filter allowedColumns supplied via env var', function () {
      process.env.INSTANA_TRACING_DB_BIND_VARIABLES_ALLOWED_COLUMNS = ' col_a , , col_b ';
      const config = coreConfig.normalize();
      expect(config.tracing.dbBindVariables).to.deep.equal({ disable: true, allowedColumns: ['col_a', 'col_b'] });
    });

    it('should ignore in-code config entirely when env vars are set', function () {
      process.env.INSTANA_TRACING_DB_BIND_VARIABLES_DISABLE = 'false';
      process.env.INSTANA_TRACING_DB_BIND_VARIABLES_ALLOWED_COLUMNS = 'env_only';
      const config = coreConfig.normalize({
        userConfig: { tracing: { dbBindVariables: { disable: true, allowedColumns: ['incode_col'] } } }
      });
      expect(config.tracing.dbBindVariables).to.deep.equal({ disable: false, allowedColumns: ['env_only'] });
    });

    it('should treat a null tracing.dbBindVariables in-code value as missing', function () {
      const config = coreConfig.normalize({
        userConfig: { tracing: { dbBindVariables: null } }
      });
      expect(config.tracing.dbBindVariables).to.deep.equal({ disable: true, allowedColumns: [] });
    });

    it('should treat an empty object in-code as missing and fall back to defaults', function () {
      const config = coreConfig.normalize({
        userConfig: { tracing: { dbBindVariables: {} } }
      });
      expect(config.tracing.dbBindVariables).to.deep.equal({ disable: true, allowedColumns: [] });
    });
  });
});
