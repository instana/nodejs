/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const expect = require('chai').expect;
const bunyan = require('bunyan');
let pino = require('pino');
let uninstrumentedLogger = require('../src/uninstrumentedLogger');
let log = require('../src/logger');
const { expectAtLeastOneMatching } = require('../../core/test/test_util');

describe('logger', () => {
  before(() => {
    Object.keys(require.cache).forEach(key => {
      if (key.includes('uninstrumentedLogger') || key.includes('src/logger') || key.includes('node_modules/pino')) {
        delete require.cache[key];
      }
    });
  });

  beforeEach(resetEnv);
  afterEach(() => {
    resetEnv();
  });

  function resetEnv() {
    delete process.env.INSTANA_LOG_LEVEL;
    delete process.env.INSTANA_DEBUG;
  }

  it('should verify pino output streams are not there for the logger', () => {
    log = require('../src/logger');
    const logger = log.init({});

    // When using pino with a multi-stream setup, the logger's streams aren't directly exposed
    const multiStream = logger.logger[pino.symbols.streamSym];

    expect(multiStream).to.be.undefined;
  });

  it('should verify pino output streams are there ', () => {
    uninstrumentedLogger = require('../src/uninstrumentedLogger');
    const logger = log.init({});

    // When using pino with a multi-stream setup, the logger's streams aren't directly exposed
    const multiStream = logger.logger[uninstrumentedLogger.symbols.streamSym];

    expect(multiStream).to.be.an('object');

    expect(multiStream).to.have.property('write').that.is.a('function');
  });

  it('should return the default parent logger if no config is available', () => {
    const logger = log.init({});
    expect(isPinoLogger(logger.logger)).to.be.true;
  });

  it('should use the parent logger if defined', () => {
    pino = require('pino');
    const parentLogger = pino({ name: 'myParentLogger' });
    const logger = log.init({ logger: parentLogger });
    const metadata = getLoggerMetadata(logger.logger);

    expect(isPinoLogger(logger.logger)).to.be.true;
    expect(metadata).to.have.property('module');
    expect(metadata.module).to.equal('instana-nodejs-logger-parent');
  });

  it('should use default log level if not defined', () => {
    const logger = log.init({ logger: pino({ name: 'myParentLogger' }) });
    expect(logger.logger.level).to.equal('info');
  });

  it('should use defined log level', () => {
    const logger = log.init({ logger: pino({ name: 'myParentLogger', level: 50 }) });
    expect(logger.logger.level).to.equal('error');
  });

  it('should use log level from env var', () => {
    process.env.INSTANA_LOG_LEVEL = 'warn';
    const logger = log.init({});
    expect(logger.logger.level).to.equal('warn');
  });

  it('should use debug log level when INSTANA_DEBUG is set', () => {
    process.env.INSTANA_DEBUG = 'true';
    const logger = log.init({});
    expect(logger.logger.level).to.equal('debug');
  });

  it('should not detect pino as bunyan', () => {
    const pinoLogger = pino();
    const logger = log.init({ logger: pinoLogger });
    expect(isPinoLogger(logger.logger)).to.be.true;
    expect(logger.logger.constructor.name).to.equal('Pino');
  });

  it('should create a child logger for pino', () => {
    const pinoLogger = pino();
    const logger = log.init({ logger: pinoLogger });
    expect(logger.logger === pinoLogger).to.be.not.true;
  });

  it('should not accept non-pino loggers without necessary logging functions', () => {
    const nonPinoLogger = {};
    const logger = log.init({ logger: nonPinoLogger });
    expect(isPinoLogger(logger.logger)).to.be.true;
  });

  it('should accept non-pino loggers with necessary logging functions', () => {
    const nonPinoLogger = {
      debug: function () {},
      info: function () {},
      warn: function () {},
      error: function () {}
    };

    const logger = log.init({ logger: nonPinoLogger });

    expect(isPinoLogger(logger.logger)).to.be.false;
  });

  it('should verify bunyan output streams', () => {
    const logger = log.init({
      logger: bunyan.createLogger({ name: 'test-bunyan-logger' })
    });

    expect(logger.logger).to.be.an.instanceOf(bunyan);
    expect(logger.logger.streams).to.be.an('array');
    // 1 x default stream that prints to stdout
    // 1 x custom stream that goes to agent stream
    expect(logger.logger.streams).to.have.lengthOf(2);
    expectAtLeastOneMatching(
      logger.logger.streams,
      stream => expect(stream.type).to.equal('raw'),
      stream => expect(stream.level).to.equal('info')
    );
  });

  it('should use ISO timestamp format for pino logger', () => {
    const logger = log.init({});

    // Create a mock write stream to capture the log output
    const capturedLogs = [];
    const mockStream = {
      write: function (chunk) {
        capturedLogs.push(JSON.parse(chunk));
      }
    };

    const originalStream = logger.logger[uninstrumentedLogger.symbols.streamSym];
    logger.logger[uninstrumentedLogger.symbols.streamSym] = mockStream;

    logger.info('Test log message');

    logger.logger[uninstrumentedLogger.symbols.streamSym] = originalStream;

    expect(capturedLogs.length).to.equal(1);
    expect(capturedLogs[0]).to.have.property('time');
    expect(capturedLogs[0].time).to.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
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
