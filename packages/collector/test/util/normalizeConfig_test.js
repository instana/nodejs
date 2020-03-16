/* eslint-env mocha */
/* eslint-disable dot-notation */

'use strict';

const expect = require('chai').expect;

const normalizeConfig = require('../../src/util/normalizeConfig');

describe('util.normalizeConfig', () => {
  beforeEach(resetEnv);
  afterEach(resetEnv);

  function resetEnv() {
    delete process.env['INSTANA_AGENT_HOST'];
    delete process.env['INSTANA_AGENT_PORT'];
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
    process.env['INSTANA_AGENT_HOST'] = 'yadayada';
    process.env['INSTANA_AGENT_PORT'] = '1357';
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

  it('should enable reporting uncaught exceptions', () => {
    const config = normalizeConfig({
      reportUncaughtException: true
    });
    expect(config.reportUncaughtException).to.be.true;
    expect(config.reportUnhandledPromiseRejections).to.be.true;
  });

  it('should enable uncaught exceptions but disable unhandled promises', () => {
    const config = normalizeConfig({
      reportUncaughtException: true,
      reportUnhandledPromiseRejections: false
    });
    expect(config.reportUncaughtException).to.be.true;
    expect(config.reportUnhandledPromiseRejections).to.be.false;
  });

  it('should enable disable unhandled promises only', () => {
    const config = normalizeConfig({
      reportUnhandledPromiseRejections: true
    });
    expect(config.reportUncaughtException).to.be.false;
    expect(config.reportUnhandledPromiseRejections).to.be.true;
  });

  function checkDefaults(config) {
    expect(config).to.be.an('object');
    expect(config.agentHost).to.equal('127.0.0.1');
    expect(config.agentPort).to.equal(42699);
    expect(config.tracing).to.be.an('object');
    expect(config.tracing.stackTraceLength).to.equal(10);
    expect(config.reportUncaughtException).to.be.false;
    expect(config.reportUnhandledPromiseRejections).to.be.false;
  }
});
