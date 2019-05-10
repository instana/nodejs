/* eslint-env mocha */
/* eslint-disable dot-notation */

'use strict';

var expect = require('chai').expect;

var normalizeConfig = require('../../src/util/normalizeConfig');

describe('util.normalizeConfig', function() {
  beforeEach(resetEnv);
  afterEach(resetEnv);

  function resetEnv() {
    delete process.env['INSTANA_AGENT_HOST'];
    delete process.env['INSTANA_AGENT_PORT'];
    delete process.env['INSTANA_AGENT_NAME'];
  }

  it('should apply all defaults', function() {
    checkDefaults(normalizeConfig());
    checkDefaults(normalizeConfig({}));
    checkDefaults(normalizeConfig({ unknowConfigOption: 13 }));
  });

  it('should accept custom agent connection configuration', function() {
    var config = normalizeConfig({
      agentHost: 'LOKAL_HORST',
      agentPort: 1207,
      agentName: 'Joe'
    });
    expect(config.agentHost).to.equal('LOKAL_HORST');
    expect(config.agentPort).to.equal(1207);
    expect(config.agentName).to.equal('Joe');
  });

  it('should accept custom agent connection configuration from environment', function() {
    process.env['INSTANA_AGENT_HOST'] = 'yadayada';
    process.env['INSTANA_AGENT_PORT'] = '1357';
    process.env['INSTANA_AGENT_NAME'] = 'Cthulhu';
    var config = normalizeConfig();
    expect(config.agentHost).to.equal('yadayada');
    expect(config.agentPort).to.equal(1357);
    expect(config.agentPort).to.be.a('number');
    expect(config.agentName).to.equal('Cthulhu');
  });

  it('should custom stack trace length', function() {
    var config = normalizeConfig({
      tracing: {
        stackTraceLength: 7
      }
    });
    expect(config.tracing.stackTraceLength).to.equal(7);
  });

  it('should enable reporting uncaught exceptions', function() {
    var config = normalizeConfig({
      reportUncaughtException: true
    });
    expect(config.reportUncaughtException).to.be.true;
    expect(config.reportUnhandledPromiseRejections).to.be.true;
  });

  it('should enable uncaught exceptions but disable unhandled promises', function() {
    var config = normalizeConfig({
      reportUncaughtException: true,
      reportUnhandledPromiseRejections: false
    });
    expect(config.reportUncaughtException).to.be.true;
    expect(config.reportUnhandledPromiseRejections).to.be.false;
  });

  it('should enable disable unhandled promises only', function() {
    var config = normalizeConfig({
      reportUnhandledPromiseRejections: true
    });
    expect(config.reportUncaughtException).to.be.false;
    expect(config.reportUnhandledPromiseRejections).to.be.true;
  });

  function checkDefaults(config) {
    expect(config).to.be.an('object');
    expect(config.agentHost).to.equal('127.0.0.1');
    expect(config.agentPort).to.equal(42699);
    expect(config.agentName).to.equal('Instana Agent');
    expect(config.tracing).to.be.an('object');
    expect(config.tracing.stackTraceLength).to.equal(10);
    expect(config.reportUncaughtException).to.be.false;
    expect(config.reportUnhandledPromiseRejections).to.be.false;
  }
});
