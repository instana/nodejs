/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const { expect } = require('chai');

const { normalizeConfig } = require('../../../src/util/configNormalizers/disableInstrumentation');

describe('util.normalizeConfig', () => {
  it('should convert true values to module names', () => {
    const config = { http: true, db: true };
    expect(normalizeConfig(config)).to.eql(['http', 'db']);
  });

  it('should convert false values to negated module names', () => {
    const config = { http: false, db: false };
    expect(normalizeConfig(config)).to.eql(['!http', '!db']);
  });

  it('should handle mixed true/false values', () => {
    const config = { logging: true, console: false };
    expect(normalizeConfig(config)).to.eql(['logging', '!console']);
  });

  it('should ignore non-boolean values', () => {
    const config = { http: true, db: 'maybe', logging: 42 };
    expect(normalizeConfig(config)).to.eql(['http']);
  });

  it('should return empty array for empty object', () => {
    expect(normalizeConfig({})).to.eql([]);
  });

  it('should handle empty arrays', () => {
    expect(normalizeConfig([])).to.eql([]);
  });

  it('should return empty array for non-object types', () => {
    expect(normalizeConfig('http')).to.eql([]);
    expect(normalizeConfig(42)).to.eql([]);
    expect(normalizeConfig(true)).to.eql([]);
  });

  it('should handle category exclusion pattern', () => {
    const config = {
      logging: true,
      console: false
    };
    expect(normalizeConfig(config)).to.eql(['logging', '!console']);
  });

  it('should handle multiple exclusions', () => {
    const config = {
      databases: true,
      mongodb: false,
      redis: false
    };
    expect(normalizeConfig(config)).to.eql(['databases', '!mongodb', '!redis']);
  });
});
