/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const expect = require('chai').expect;
const bunyan = require('bunyan');
const pino = require('pino');

const log = require('../src/logger');
const { expectAtLeastOneMatching } = require('../../core/test/test_util');

describe('logger', () => {
  beforeEach(resetEnv);
  afterEach(resetEnv);

  function resetEnv() {
    delete process.env.INSTANA_LOG_LEVEL;
    delete process.env.INSTANA_DEBUG;
  }

  it('should return the default parent logger if no config is available', () => {
    log.init({});
    const logger = log.getLogger('myLogger');
    expect(logger).to.be.an.instanceOf(bunyan);
  });

  it('should return a child logger if requested', () => {
    log.init({});
    const logger = log.getLogger('childName');
    expect(logger).to.be.an.instanceOf(bunyan);
    expect(logger.fields).to.have.property('module');
    expect(logger.fields.module).to.equal('childName');
  });

  it('should use the parent logger if defined', () => {
    const logger = bunyan.createLogger({ name: 'myParentLogger' });
    log.init({ logger });
    const childLogger = log.getLogger('childName');

    expect(logger).to.be.an.instanceOf(bunyan);
    expect(childLogger.fields).to.have.property('module');
    expect(childLogger.fields.module).to.equal('childName');
  });

  it('should add child logger to defined parent', () => {
    log.init({ logger: bunyan.createLogger({ name: 'myParentLogger' }) });
    const logger = log.getLogger('childName');

    expect(logger.fields).to.have.property('module');
    expect(logger.fields.module).to.equal('childName');
  });

  it('should use default log level if not defined', () => {
    log.init({ logger: bunyan.createLogger({ name: 'myParentLogger' }) });
    const logger = log.getLogger('childName');

    expect(logger.level()).to.equal(30);
  });

  it('should use defined log level', () => {
    log.init({ level: 'error', logger: bunyan.createLogger({ name: 'myParentLogger' }) });
    const logger = log.getLogger('childName');

    expect(logger.level()).to.equal(50);
  });

  it('should use log level from env var', () => {
    process.env.INSTANA_LOG_LEVEL = 'warn';
    log.init({});
    const logger = log.getLogger('childName');
    expect(logger.level()).to.equal(40);
  });

  it('should use debug log level when INSTANA_DEBUG is set', () => {
    process.env.INSTANA_DEBUG = 'true';
    log.init({});
    const logger = log.getLogger('childName');
    expect(logger.level()).to.equal(20);
  });

  it('should not detect pino as bunyan', () => {
    const pinoLogger = pino();
    log.init({ logger: pinoLogger });
    const logger = log.getLogger('myLogger');
    expect(logger).to.not.be.an.instanceOf(bunyan);
    expect(logger.constructor.name).to.equal('Pino');
  });

  it('should create a child logger for pino', () => {
    const pinoLogger = pino();
    log.init({ logger: pinoLogger });
    const logger = log.getLogger('myLogger');
    expect(logger === pinoLogger).to.be.not.true;
  });

  it('should not accept non-bunyan loggers without necessary logging functions', () => {
    const nonBunyanLogger = {};

    log.init({ logger: nonBunyanLogger });

    const logger = log.getLogger('myLogger');
    expect(logger).to.be.an.instanceOf(bunyan);
  });

  it('should accept non-bunyan loggers with necessary logging functions', () => {
    const nonBunyanLogger = {
      debug: function () {},
      info: function () {},
      warn: function () {},
      error: function () {}
    };

    log.init({ logger: nonBunyanLogger });

    const logger = log.getLogger('myLogger');
    expect(logger).not.to.be.an.instanceOf(bunyan);
  });

  it('should reset loggers when the logger is set after initialization', () => {
    log.init({});
    let reInitCalled = false;
    let logger;
    logger = log.getLogger('myLogger', newLogger => {
      reInitCalled = true;
      logger = newLogger;
    });

    // first getLogger call should yield the default bunyan logger
    expect(logger).to.be.an.instanceOf(bunyan);
    expect(logger.fields.name).to.equal('@instana/collector');
    const originalLogger = logger;

    const logger2 = bunyan.createLogger({ name: 'new-logger' });
    log.init({ logger: logger2 }, true);

    expect(reInitCalled).to.be.true;
    expect(logger).to.be.an.instanceOf(bunyan);
    expect(logger === originalLogger).to.not.be.true;
    expect(logger.fields.name).to.equal('new-logger');
  });

  it('should not choke on re-initialization when there is no reInit callback', () => {
    log.init({});
    const logger = log.getLogger('myLogger');

    // first getLogger call should yield the default bunyan logger
    expect(logger).to.be.an.instanceOf(bunyan);
    expect(logger.fields.name).to.equal('@instana/collector');

    const logger2 = bunyan.createLogger({ name: 'new-logger' });
    log.init({ logger: logger2 });
  });

  it('should verify the output streams', () => {
    log.init({});
    const logger = log.getLogger('myLogger');
    expect(logger).to.be.an.instanceOf(bunyan);

    expect(logger.streams).to.be.an('array');
    // 1 x default stream that prints to stdout
    // 1 x custom stream that goes to agent stream
    expect(logger.streams).to.have.lengthOf(2);

    expectAtLeastOneMatching(
      logger.streams,
      stream => expect(stream.type).to.equal('raw'),
      stream => expect(stream.level).to.equal('info')
    );
  });
});
