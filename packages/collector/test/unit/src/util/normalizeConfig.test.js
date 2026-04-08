/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const expect = require('chai').expect;
const testUtils = require('@_local/core/test/test_util');
const coreConfig = require('@instana/core/src/config');
const normalizeConfig = require('@_local/collector/src/util/normalizeConfig');

describe('util.normalizeConfig', () => {
  before(() => {
    coreConfig.init(testUtils.createFakeLogger());
  });

  beforeEach(resetEnv);
  afterEach(resetEnv);

  function resetEnv() {
    delete process.env.INSTANA_AGENT_HOST;
    delete process.env.INSTANA_AGENT_PORT;
    delete process.env.INSTANA_AGENT_REQUEST_TIMEOUT;
    delete process.env.INSTANA_AUTO_PROFILE;
  }

  describe('defaults', () => {
    it('should apply all defaults when nothing is provided', () => {
      const config = normalizeConfig();

      expect(config.agentHost).to.equal('127.0.0.1');
      expect(config.agentPort).to.equal(42699);
      expect(config.agentRequestTimeout).to.equal(5000);
      expect(config.autoProfile).to.equal(false);
      expect(config.tracing).to.be.an('object');
      expect(config.reportUnhandledPromiseRejections).to.be.false;
    });
  });

  describe('agentHost', () => {
    it('should use env over config over default', () => {
      process.env.INSTANA_AGENT_HOST = 'env-host';

      const config = normalizeConfig({
        agentHost: 'config-host'
      });

      expect(config.agentHost).to.equal('env-host');
    });

    it('should use config when env is not set', () => {
      const config = normalizeConfig({
        agentHost: 'config-host'
      });

      expect(config.agentHost).to.equal('config-host');
    });

    it('should fallback to default', () => {
      const config = normalizeConfig({});

      expect(config.agentHost).to.equal('127.0.0.1');
    });
  });

  describe('agentPort', () => {
    it('should use env over config over default', () => {
      process.env.INSTANA_AGENT_PORT = '9999';

      const config = normalizeConfig({
        agentPort: 1234
      });

      expect(config.agentPort).to.equal(9999);
    });

    it('should use config when env is not set', () => {
      const config = normalizeConfig({
        agentPort: 1234
      });

      expect(config.agentPort).to.equal(1234);
    });

    it('should fallback to default', () => {
      const config = normalizeConfig({});

      expect(config.agentPort).to.equal(42699);
    });

    it('should fallback to default for invalid env value', () => {
      process.env.INSTANA_AGENT_PORT = 'invalid';

      const config = normalizeConfig();

      expect(config.agentPort).to.equal(42699);
    });
  });

  describe('agentRequestTimeout', () => {
    it('should use env over config over default', () => {
      process.env.INSTANA_AGENT_REQUEST_TIMEOUT = '8000';

      const config = normalizeConfig({
        agentRequestTimeout: 2000
      });

      expect(config.agentRequestTimeout).to.equal(8000);
    });

    it('should use config when env is not set', () => {
      const config = normalizeConfig({
        agentRequestTimeout: 2000
      });

      expect(config.agentRequestTimeout).to.equal(2000);
    });

    it('should fallback to default', () => {
      const config = normalizeConfig({});

      expect(config.agentRequestTimeout).to.equal(5000);
    });

    it('should fallback to default for invalid env value', () => {
      process.env.INSTANA_AGENT_REQUEST_TIMEOUT = 'abc';

      const config = normalizeConfig();

      expect(config.agentRequestTimeout).to.equal(5000);
    });
  });

  describe('autoProfile', () => {
    it('should use env over config over default', () => {
      process.env.INSTANA_AUTO_PROFILE = 'true';

      const config = normalizeConfig({
        autoProfile: false
      });

      expect(config.autoProfile).to.equal('true');
    });

    it('should use config when env is not set', () => {
      const config = normalizeConfig({
        autoProfile: true
      });

      expect(config.autoProfile).to.equal(true);
    });

    it('should fallback to default', () => {
      const config = normalizeConfig({});

      expect(config.autoProfile).to.equal(false);
    });
  });

  describe('tracing', () => {
    it('should initialize tracing object if missing', () => {
      const config = normalizeConfig();

      expect(config.tracing).to.be.an('object');
    });

    it('should preserve provided tracing config', () => {
      const config = normalizeConfig({
        tracing: {
          stackTraceLength: 7
        }
      });

      expect(config.tracing.stackTraceLength).to.equal(7);
    });
  });

  describe('reportUnhandledPromiseRejections', () => {
    it('should default to false', () => {
      const config = normalizeConfig();

      expect(config.reportUnhandledPromiseRejections).to.be.false;
    });

    it('should allow explicit false', () => {
      const config = normalizeConfig({
        reportUnhandledPromiseRejections: false
      });

      expect(config.reportUnhandledPromiseRejections).to.be.false;
    });

    it('should allow explicit true', () => {
      const config = normalizeConfig({
        reportUnhandledPromiseRejections: true
      });

      expect(config.reportUnhandledPromiseRejections).to.be.true;
    });
  });
});
