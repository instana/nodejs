/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const expect = require('chai').expect;

const normalizeConfig = require('../../src/util/normalizeConfig');

describe('util.normalizeConfig', () => {
  beforeEach(resetEnv);
  afterEach(resetEnv);

  function resetEnv() {
    delete process.env.INSTANA_AGENT_HOST;
    delete process.env.INSTANA_AGENT_PORT;
  }

  it('should apply all defaults', () => {
    checkDefaults(normalizeConfig());
    checkDefaults(normalizeConfig({}));
    checkDefaults(normalizeConfig({ unknowConfigOption: 13 }));
  });

  it('should accept custom agent connection configuration', () => {
    const config = normalizeConfig({
      agentHost: 'LOKAL_HORST',
      agentPort: 1207
    });
    expect(config.agentHost).to.equal('LOKAL_HORST');
    expect(config.agentPort).to.equal(1207);
  });

  it('should accept custom agent connection configuration from environment', () => {
    process.env.INSTANA_AGENT_HOST = 'yadayada';
    process.env.INSTANA_AGENT_PORT = '1357';
    const config = normalizeConfig();
    expect(config.agentHost).to.equal('yadayada');
    expect(config.agentPort).to.equal(1357);
    expect(config.agentPort).to.be.a('number');
  });

  it('should custom stack trace length', () => {
    const config = normalizeConfig({
      tracing: {
        stackTraceLength: 7
      }
    });
    expect(config.tracing.stackTraceLength).to.equal(7);
  });

  it('should disable unhandled promises', () => {
    const config = normalizeConfig({
      reportUnhandledPromiseRejections: false
    });
    expect(config.reportUnhandledPromiseRejections).to.be.false;
  });

  it('should enable unhandled promises', () => {
    const config = normalizeConfig({
      reportUnhandledPromiseRejections: true
    });
    expect(config.reportUnhandledPromiseRejections).to.be.true;
  });

  function checkDefaults(config) {
    expect(config).to.be.an('object');
    expect(config.agentHost).to.equal('127.0.0.1');
    expect(config.agentPort).to.equal(42699);
    expect(config.tracing).to.be.an('object');
    expect(config.reportUnhandledPromiseRejections).to.be.false;
  }
});
