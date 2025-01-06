/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const expect = require('chai').expect;
const pino = require('pino');
const bunyan = require('bunyan');
const { expectAtLeastOneMatching } = require('../../core/test/test_util');

const log = require('../src/logger');

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
    expect(isPinoLogger(logger)).to.be.true;
  });

  it('should return a child logger if requested', () => {
    log.init({});
    const logger = log.getLogger('childName');
    const metadata = getLoggerMetadata(logger);

    expect(isPinoLogger(logger)).to.be.true;

    expect(metadata).to.have.property('module');
    expect(metadata.module).to.equal('childName');
  });

  it('should use the parent logger if defined', () => {
    const logger = pino({ name: 'myParentLogger' });
    log.init({ logger });
    const childLogger = log.getLogger('childName');
    const metadata = getLoggerMetadata(childLogger);

    expect(isPinoLogger(logger)).to.be.true;
    expect(metadata).to.have.property('module');
    expect(metadata.module).to.equal('childName');
  });

  it('should add child logger to defined parent', () => {
    const logger = pino({ name: 'myParentLogger' });
    log.init({ logger });
    const childLogger = log.getLogger('childName');

    const childtMetaData = getLoggerMetadata(childLogger);

    expect(childtMetaData).to.have.property('module');
    expect(childtMetaData?.module).to.equal('childName');
  });

  it('should use default log level if not defined', () => {
    log.init({ logger: pino({ name: 'myParentLogger' }) });
    const logger = log.getLogger('childName');

    expect(logger.level).to.equal('info');
  });

  it('should use defined log level', () => {
    log.init({ logger: pino({ name: 'myParentLogger', level: 50 }) });
    const logger = log.getLogger('childName');

    expect(logger.level).to.equal('error');
  });

  it('should use log level from env var', () => {
    process.env.INSTANA_LOG_LEVEL = 'warn';
    log.init({});
    const logger = log.getLogger('childName');
    expect(logger.level).to.equal('warn');
  });

  it('should use debug log level when INSTANA_DEBUG is set', () => {
    process.env.INSTANA_DEBUG = 'true';
    log.init({});
    const logger = log.getLogger('childName');
    expect(logger.level).to.equal('debug');
  });

  it('should not detect pino as bunyan', () => {
    const pinoLogger = pino();
    log.init({ logger: pinoLogger });
    const logger = log.getLogger('myLogger');
    expect(isPinoLogger(logger)).to.be.true;
    expect(logger.constructor.name).to.equal('Pino');
  });

  it('should create a child logger for pino', () => {
    const pinoLogger = pino();
    log.init({ logger: pinoLogger });
    const logger = log.getLogger('myLogger');
    expect(logger === pinoLogger).to.be.not.true;
  });

  it('should not accept non-pino loggers without necessary logging functions', () => {
    const nonPinoLogger = {};

    log.init({ logger: nonPinoLogger });

    const logger = log.getLogger('myLogger');
    expect(isPinoLogger(logger)).to.be.true;
  });

  it('should accept non-pino loggers with necessary logging functions', () => {
    const nonPinoLogger = {
      debug: function () {},
      info: function () {},
      warn: function () {},
      error: function () {}
    };

    log.init({ logger: nonPinoLogger });

    const logger = log.getLogger('myLogger');
    expect(isPinoLogger(logger)).to.be.false;
  });

  it('should reset loggers when the logger is set after initialization', () => {
    log.init({});
    let reInitCalled = false;
    let logger;
    logger = log.getLogger('myLogger', newLogger => {
      reInitCalled = true;
      logger = newLogger;
    });

    expect(isPinoLogger(logger)).to.be.true;

    const metadata = getLoggerMetadata(logger);

    expect(metadata.name).to.equal('@instana/collector');
    const originalLogger = logger;

    const logger2 = pino({ name: 'new-logger' });
    log.init({ logger: logger2 }, true);

    expect(reInitCalled).to.be.true;
    expect(isPinoLogger(logger)).to.be.true;
    expect(logger === originalLogger).to.not.be.true;

    const metadata2 = getLoggerMetadata(logger2);

    expect(metadata2.name).to.equal('new-logger');
  });

  it('should not choke on re-initialization when there is no reInit callback', () => {
    log.init({});
    const logger = log.getLogger('myLogger');

    // first getLogger call should yield the default pino logger
    expect(isPinoLogger(logger)).to.be.true;

    const metadata = getLoggerMetadata(logger);
    expect(metadata.name).to.equal('@instana/collector');

    const logger2 = pino({ name: 'new-logger' });
    log.init({ logger: logger2 });
  });

  it('should verify bunyan output streams', () => {
    log.init({
      logger: bunyan.createLogger({ name: 'test-bunyan-logger' })
    });
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

  // TODO: This test case is not consistent.
  // Need to investigate further why its failing in the initial run and succeeding after that

  // it('should verify pino output streams', () => {
  //   log.init({});
  //   const logger = log.getLogger('myLogger');

  //   // When using pino with a multi-stream setup, the logger's streams aren't directly exposed
  //   const multiStream = logger[pino.symbols.streamSym];

  //   expect(multiStream).to.be.an('object');

  //   expect(multiStream).to.have.property('write').that.is.a('function');
  // });
});

/**
 * @param {*} _logger
 * @returns {boolean}
 */
function isPinoLogger(_logger) {
  return (
    _logger && typeof _logger === 'object' && typeof _logger.child === 'function' && typeof _logger.level === 'string'
  );
}

/**
 * function to extract logger metadata from Pino's internal `chindings` symbol.
 */
function getLoggerMetadata(logger) {
  const metadata = logger.bindings() || {};

  return metadata;
}
