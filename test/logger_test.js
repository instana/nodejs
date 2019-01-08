/* eslint-env mocha */
/* eslint-disable no-console */

'use strict';

var expect = require('chai').expect;
var bunyan = require('bunyan');

var log = require('../src/logger');

describe('logger', function() {
  it('should return the default parent logger if no config is available', function() {
    log.init({});
    var logger = log.getLogger('myLogger');
    expect(logger).to.be.an.instanceOf(bunyan);
  });

  it('should return a child logger if requested', function() {
    log.init({});
    var logger = log.getLogger('childName');
    expect(logger).to.be.an.instanceOf(bunyan);
    expect(logger.fields).to.have.property('module');
    expect(logger.fields.module).to.equal('childName');
  });

  it('should use the parent logger if defined', function() {
    var logger = bunyan.createLogger({ name: 'myParentLogger' });
    log.init({ logger: logger });
    var childLogger = log.getLogger('childName');

    expect(logger).to.be.an.instanceOf(bunyan);
    expect(childLogger.fields).to.have.property('module');
    expect(childLogger.fields.module).to.equal('childName');
  });

  it('should add child logger to defined parent', function() {
    log.init({ logger: bunyan.createLogger({ name: 'myParentLogger' }) });
    var logger = log.getLogger('childName');

    expect(logger.fields).to.have.property('module');
    expect(logger.fields.module).to.equal('childName');
  });

  it('should use default log level if not defined', function() {
    log.init({ logger: bunyan.createLogger({ name: 'myParentLogger' }) });
    var logger = log.getLogger('childName');

    expect(logger.level()).to.equal(30);
  });

  it('should use defined log level', function() {
    log.init({ level: 'error', logger: bunyan.createLogger({ name: 'myParentLogger' }) });
    var logger = log.getLogger('childName');

    expect(logger.level()).to.equal(50);
  });

  it('should not accept non-bunyan loggers without necessary logging functions', function() {
    var nonBunyanLogger = {};

    log.init({ logger: nonBunyanLogger });

    var logger = log.getLogger('myLogger');
    expect(logger).to.be.an.instanceOf(bunyan);
  });

  it('should accept non-bunyan loggers with necessary logging functions', function() {
    var nonBunyanLogger = {
      debug: function() {},
      info: function() {},
      warn: function() {},
      error: function() {}
    };

    log.init({ logger: nonBunyanLogger });

    var logger = log.getLogger('myLogger');
    expect(logger).not.to.be.an.instanceOf(bunyan);
  });

  it('should reset loggers when the logger is set after initialization', function() {
    log.init({});
    var reInitCalled = false;
    var logger;
    logger = log.getLogger('myLogger', function(newLogger) {
      reInitCalled = true;
      logger = newLogger;
    });

    // first getLogger call should yield the default bunyan logger
    expect(logger).to.be.an.instanceOf(bunyan);
    expect(logger.fields.name).to.equal('instana-nodejs-sensor');
    var originalLogger = logger;

    var logger2 = bunyan.createLogger({ name: 'new-logger' });
    log.init({ logger: logger2 });

    expect(reInitCalled).to.be.true;
    expect(logger).to.be.an.instanceOf(bunyan);
    expect(logger === originalLogger).to.not.be.true;
    expect(logger.fields.name).to.equal('new-logger');
  });

  it('should not choke on re-initialization when there is no reInit callback', function() {
    log.init({});
    var logger = log.getLogger('myLogger');

    // first getLogger call should yield the default bunyan logger
    expect(logger).to.be.an.instanceOf(bunyan);
    expect(logger.fields.name).to.equal('instana-nodejs-sensor');

    var logger2 = bunyan.createLogger({ name: 'new-logger' });
    log.init({ logger: logger2 });
  });
});
