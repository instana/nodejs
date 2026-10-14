/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const expect = require('chai').expect;

const { isLogSpan } = require('../../../src/otlpExporter/logs/util');

describe('otlpExporter/logs/util', () => {
  describe('isLogSpan', () => {
    it('returns false for null/undefined', () => {
      expect(isLogSpan(null)).to.be.false;
      expect(isLogSpan(undefined)).to.be.false;
    });

    it('returns true when span.data.log is present', () => {
      expect(isLogSpan({ data: { log: { message: 'hi' } } })).to.be.true;
    });

    it('returns true when span.data.log is an empty object', () => {
      expect(isLogSpan({ data: { log: {} } })).to.be.true;
    });

    it('returns true for span name "log.pino"', () => {
      expect(isLogSpan({ n: 'log.pino' })).to.be.true;
    });

    it('returns true for span name "log.winston"', () => {
      expect(isLogSpan({ n: 'log.winston' })).to.be.true;
    });

    it('returns true for span name "log.console"', () => {
      expect(isLogSpan({ n: 'log.console' })).to.be.true;
    });

    it('returns true for span name "log.bunyan"', () => {
      expect(isLogSpan({ n: 'log.bunyan' })).to.be.true;
    });

    it('returns false for an HTTP span', () => {
      expect(isLogSpan({ n: 'node.http.server', data: { http: {} } })).to.be.false;
    });

    it('returns false for a database span', () => {
      expect(isLogSpan({ n: 'postgres', data: { pg: {} } })).to.be.false;
    });

    it('returns false when span.n does not start with "log."', () => {
      expect(isLogSpan({ n: 'mylog.something' })).to.be.false;
    });

    it('returns false for a span with no data and no n field', () => {
      expect(isLogSpan({ t: 'abc', s: 'def' })).to.be.false;
    });
  });
});
