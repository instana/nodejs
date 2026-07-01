/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const expect = require('chai').expect;

const { isLogSpan } = require('../../../src/otlpExporter/traces/util');

describe('otlpExporter/traces/util', () => {
  describe('isLogSpan', () => {
    describe('log span detection via data.log', () => {
      it('should return true for span with data.log property', () => {
        const span = {
          t: '123',
          s: '456',
          data: {
            log: {
              message: 'test log message'
            }
          }
        };

        expect(isLogSpan(span)).to.be.true;
      });

      it('should return true for span with empty data.log object', () => {
        const span = {
          t: '123',
          s: '456',
          data: {
            log: {}
          }
        };

        expect(isLogSpan(span)).to.be.true;
      });

      it('should return true for span with data.log containing multiple properties', () => {
        const span = {
          t: '123',
          s: '456',
          data: {
            log: {
              message: 'error occurred',
              level: 'error',
              timestamp: 1234567890
            }
          }
        };

        expect(isLogSpan(span)).to.be.true;
      });
    });

    describe('log span detection via span name prefix', () => {
      it('should return true for span with name starting with "log."', () => {
        const span = {
          t: '123',
          s: '456',
          n: 'log.console'
        };

        expect(isLogSpan(span)).to.be.true;
      });

      it('should return true for span with name "log.winston"', () => {
        const span = {
          t: '123',
          s: '456',
          n: 'log.winston'
        };

        expect(isLogSpan(span)).to.be.true;
      });

      it('should return true for any span name starting with "log."', () => {
        const span = {
          t: '123',
          s: '456',
          n: 'log.custom'
        };

        expect(isLogSpan(span)).to.be.true;
      });

      it('should return true for span with just "log." as name', () => {
        const span = {
          t: '123',
          s: '456',
          n: 'log.'
        };

        expect(isLogSpan(span)).to.be.true;
      });
    });

    describe('non-log span detection', () => {
      it('should return false for HTTP span', () => {
        const span = {
          t: '123',
          s: '456',
          n: 'node.http.server',
          data: {
            http: {
              method: 'GET',
              url: '/api/users'
            }
          }
        };

        expect(isLogSpan(span)).to.be.false;
      });

      it('should return false for database span', () => {
        const span = {
          t: '123',
          s: '456',
          n: 'postgres',
          data: {
            pg: {
              stmt: 'SELECT * FROM users'
            }
          }
        };

        expect(isLogSpan(span)).to.be.false;
      });
    });
  });
});
