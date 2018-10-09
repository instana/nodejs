/* eslint-env mocha */
/* eslint-disable no-console */

'use strict';

var expect = require('chai').expect;
var bunyan = require('bunyan');

var log = require('../src/logger');


describe('logger', function() {
  it('should return the default parent logger if no config is available', function() {
    var logger = log.getLogger('myLogger');
    expect(logger).to.be.an.instanceOf(bunyan);
  });

  it('should return a child logger if wanted', function() {
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

  it('should accept non-bunyan loggers', function() {
    var nonBunyanLogger = {};

    log.init({ nonBunyanLogger: nonBunyanLogger });

    expect(log.getLogger('childName')).to.equal(nonBunyanLogger);
  });
});
