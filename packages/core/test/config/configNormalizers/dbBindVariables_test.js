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
    dbBindVariables.init({ logger: createFakeLogger() });
    coreConfig.init(createFakeLogger());
  });

  beforeEach(resetEnv);
  afterEach(resetEnv);

  function resetEnv() {
    delete process.env.INSTANA_TRACING_DB_BIND_VARIABLES_DISABLE;
    delete process.env.INSTANA_TRACING_DB_BIND_VARIABLES_ALLOWED_COLUMNS;
  }

  describe('fromEnv', function () {
    it('should return null when no env vars are set', function () {
      expect(dbBindVariables.fromEnv()).to.equal(null);
    });

    it('should parse INSTANA_TRACING_DB_BIND_VARIABLES_DISABLE=true', function () {
      process.env.INSTANA_TRACING_DB_BIND_VARIABLES_DISABLE = 'true';
      const result = dbBindVariables.fromEnv();
      expect(result).to.deep.equal({ disable: true, allowedColumns: [] });
    });

    it('should parse INSTANA_TRACING_DB_BIND_VARIABLES_DISABLE=false', function () {
      process.env.INSTANA_TRACING_DB_BIND_VARIABLES_DISABLE = 'false';
      const result = dbBindVariables.fromEnv();
      expect(result).to.deep.equal({ disable: false, allowedColumns: [] });
    });

    it('should parse INSTANA_TRACING_DB_BIND_VARIABLES_ALLOWED_COLUMNS', function () {
      process.env.INSTANA_TRACING_DB_BIND_VARIABLES_DISABLE = 'false';
      process.env.INSTANA_TRACING_DB_BIND_VARIABLES_ALLOWED_COLUMNS = 'username, order_id , api_key';
      const result = dbBindVariables.fromEnv();
      expect(result).to.deep.equal({ disable: false, allowedColumns: ['username', 'order_id', 'api_key'] });
    });

    it('should ignore empty column entries in the comma-separated list', function () {
      process.env.INSTANA_TRACING_DB_BIND_VARIABLES_DISABLE = 'false';
      process.env.INSTANA_TRACING_DB_BIND_VARIABLES_ALLOWED_COLUMNS = 'username,,order_id,';
      const result = dbBindVariables.fromEnv();
      expect(result.allowedColumns).to.deep.equal(['username', 'order_id']);
    });

    it('should return a config object when only ALLOWED_COLUMNS is set', function () {
      process.env.INSTANA_TRACING_DB_BIND_VARIABLES_ALLOWED_COLUMNS = 'order_id';
      const result = dbBindVariables.fromEnv();
      // disable defaults to true when only ALLOWED_COLUMNS is set (no DISABLE override)
      expect(result).to.deep.equal({ disable: true, allowedColumns: ['order_id'] });
    });

    it('should keep the default disable=true when DISABLE env var is invalid', function () {
      process.env.INSTANA_TRACING_DB_BIND_VARIABLES_DISABLE = 'not-a-bool';
      process.env.INSTANA_TRACING_DB_BIND_VARIABLES_ALLOWED_COLUMNS = 'order_id';
      const result = dbBindVariables.fromEnv();
      expect(result.disable).to.equal(true);
      expect(result.allowedColumns).to.deep.equal(['order_id']);
    });
  });

  describe('fromAgent', function () {
    it('should return null for null or non-object input', function () {
      expect(dbBindVariables.fromAgent(null)).to.equal(null);
      expect(dbBindVariables.fromAgent(undefined)).to.equal(null);
      expect(dbBindVariables.fromAgent('string')).to.equal(null);
      expect(dbBindVariables.fromAgent(42)).to.equal(null);
    });

    it('should return null for an empty object (no recognized keys)', function () {
      expect(dbBindVariables.fromAgent({})).to.equal(null);
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

    it('should ignore non-boolean disable values and return null for empty object', function () {
      const result = dbBindVariables.fromAgent({ disable: 'yes' });
      // 'disable' is invalid, no allowed-columns set → nothing changed → null
      expect(result).to.equal(null);
    });
  });

  describe('fromInCode', function () {
    it('should return null for null or non-object input', function () {
      expect(dbBindVariables.fromInCode(null)).to.equal(null);
      expect(dbBindVariables.fromInCode(undefined)).to.equal(null);
      expect(dbBindVariables.fromInCode('string')).to.equal(null);
      expect(dbBindVariables.fromInCode(42)).to.equal(null);
    });

    it('should return null for an empty object (no recognized keys)', function () {
      expect(dbBindVariables.fromInCode({})).to.equal(null);
    });

    it('should parse disable=true', function () {
      const result = dbBindVariables.fromInCode({ disable: true });
      expect(result).to.deep.equal({ disable: true, allowedColumns: [] });
    });

    it('should parse disable=false', function () {
      const result = dbBindVariables.fromInCode({ disable: false });
      expect(result).to.deep.equal({ disable: false, allowedColumns: [] });
    });

    it('should parse allowedColumns', function () {
      const result = dbBindVariables.fromInCode({ disable: false, allowedColumns: ['order_id', 'username'] });
      expect(result).to.deep.equal({ disable: false, allowedColumns: ['order_id', 'username'] });
    });

    it('should trim whitespace from allowedColumns entries', function () {
      const result = dbBindVariables.fromInCode({ allowedColumns: [' order_id ', 'username '] });
      expect(result.allowedColumns).to.deep.equal(['order_id', 'username']);
    });

    it('should filter out blank allowedColumns entries', function () {
      const result = dbBindVariables.fromInCode({ allowedColumns: ['order_id', '', '  ', 'username'] });
      expect(result.allowedColumns).to.deep.equal(['order_id', 'username']);
    });

    it('should ignore a non-boolean disable and still capture valid allowedColumns', function () {
      const result = dbBindVariables.fromInCode({ disable: 'yes', allowedColumns: ['order_id'] });
      // disable is invalid but allowedColumns is valid → changed=true, disable stays at default (true)
      expect(result).to.deep.equal({ disable: true, allowedColumns: ['order_id'] });
    });

    it('should ignore invalid allowedColumns and still capture valid disable', function () {
      const result = dbBindVariables.fromInCode({ disable: false, allowedColumns: 'not-an-array' });
      // allowedColumns is invalid but disable is valid → changed=true, allowedColumns stays at default ([])
      expect(result).to.deep.equal({ disable: false, allowedColumns: [] });
    });

    it('should return null when both fields are invalid', function () {
      const result = dbBindVariables.fromInCode({ disable: 'yes', allowedColumns: 'not-an-array' });
      expect(result).to.equal(null);
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

    it('should fall back to defaults when in-code config has no valid fields', function () {
      const config = coreConfig.normalize({
        userConfig: { tracing: { dbBindVariables: { disable: 'not-a-bool', allowedColumns: 'not-an-array' } } }
      });
      expect(config.tracing.dbBindVariables).to.deep.equal({ disable: true, allowedColumns: [] });
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
