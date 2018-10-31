'use strict';

var expect = require('chai').expect;

var controls = require('./apps/controls');

/**
 * This test suite does not test Instana code but verifies assumptions around process.on('uncaughtException') across
 * all supported Node.js versions.
 */
describe('uncaught exceptions assumptions - ', function() {
  describe('synchronous non-throwing uncaught exceptions handler', function() {
    it('executes handlers in order', function() {
      var result = controls.order();
      expect(result.status).to.equal(0);
      var stdOut = result.stdout.toString('utf-8');
      var stdErr = result.stderr.toString('utf-8');
      expect(stdOut).to.match(/HANDLER 1\s*HANDLER 2\s*Bye, bye/);
      expect(stdErr).to.be.empty;
    });
  });

  describe('synchronous rethrowing uncaught exceptions handler', function() {
    it('terminates the process', function() {
      var result = controls.rethrow();
      expect(result.status).to.equal(7);
    });

    it('keeps the original stack trace', function() {
      var result = controls.rethrow();
      // Actually, it will be 7, see
      // https://nodejs.org/api/process.html#process_exit_codes
      expect(result.status).to.not.equal(1);
      var stdOut = result.stdout.toString('utf-8');
      var stdErr = result.stderr.toString('utf-8');
      expect(stdOut).to.be.empty;
      expect(stdErr).to.contain('Error: Boom');
      expect(stdErr).to.contain('_onTimeout');
      expect(stdErr).to.contain('test/util/uncaught_exceptions/apps/rethrow.js');
    });

    it('executes handlers registered before rethrowing handler, but not handlers registered after that', function() {
      var result = controls.rethrowWhenOtherHandlersArePresent();
      expect(result.status).to.not.equal(0);
      var stdOut = result.stdout.toString('utf-8');
      var stdErr = result.stderr.toString('utf-8');
      expect(stdOut).to.match(/HANDLER 1\s*HANDLER 2\s*HANDLER 3/);
      expect(stdErr).to.not.be.empty;
      expect(stdErr).to.contain('Error: Boom');
      expect(stdErr).to.contain('_onTimeout');
      expect(stdErr).to.contain('test/util/uncaught_exceptions/apps/rethrowWhenOtherHandlersArePresent.js');
    });
  });
});
