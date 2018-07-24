'use strict';

var expect = require('chai').expect;

var controls = require('./apps/controls');

/**
 * This test suite does not test Instana code but verifies assumptions around process.on('uncaughtException') across
 * all supported Node.js versions.
 */
describe('uncaughtExceptions assumptions - ', function() {
  describe('synchronous non-throwing uncaughtExceptions handler', function() {
    it('executes handlers in order', function() {
      var result = controls.order();
      expect(result.status).to.equal(0);
      var stdOut = result.stdout.toString('utf-8');
      var stdErr = result.stderr.toString('utf-8');
      expect(stdOut).to.match(/HANDLER 1\s*HANDLER 2\s*Bye, bye/);
      expect(stdErr).to.be.empty;
    });
  });

  describe('synchronous rethrowing uncaughtExceptions handler', function() {
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
      expect(stdErr).to.contain(
        'test/util/uncaughtExceptions/apps/rethrow.js'
      );
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
      expect(stdErr).to.contain(
        'test/util/uncaughtExceptions/apps/rethrowWhenOtherHandlersArePresent.js'
      );
    });
  });

  describe('asynchronous rethrow', function() {
    it('terminates the process with the original exit code', function() {
      var result = controls.asyncInHandler();
      expect(result.status).to.equal(1);
    });

    it('finishes the async operation', function() {
      var result = controls.asyncInHandler();
      var stdOut = result.stdout.toString('utf-8');
      expect(stdOut).to.contain('Async operation has finished.');
    });

    it('keeps the original stack trace', function() {
      var result = controls.asyncInHandler();
      expect(result.status).to.equal(1);
      var stdErr = result.stderr.toString('utf-8');
      expect(stdErr).to.contain('Error: Boom');
      expect(stdErr).to.contain('_onTimeout');
      expect(stdErr).to.contain(
        'test/util/uncaughtExceptions/apps/asyncInHandler.js'
      );
    });
  });

  describe('asynchronous rethrow that removes other handlers', function() {
    it('terminates the process with the original exit code', function() {
      var result = controls.asyncRethrowWhenOtherHandlersArePresent();
      expect(result.status).to.equal(1);
    });

    it('calls all other handlers, but not twice', function() {
      var result = controls.asyncRethrowWhenOtherHandlersArePresent();
      var stdOut = result.stdout.toString('utf-8');
      expect(countIn(stdOut, 'HANDLER 1')).to.equal(1);
      expect(countIn(stdOut, 'HANDLER 2')).to.equal(1);
      expect(countIn(stdOut, 'HANDLER 3')).to.equal(1);
      expect(countIn(stdOut, 'HANDLER 4')).to.equal(1);
      expect(countIn(stdOut, 'HANDLER 5')).to.equal(1);
    });

    it('calls all handlers in the right order', function() {
      var result = controls.asyncRethrowWhenOtherHandlersArePresent();
      var stdOut = result.stdout.toString('utf-8');
      expect(stdOut).to.match(/HANDLER 1\s*HANDLER 2\s*HANDLER 3\s*HANDLER 4\s*HANDLER 5.*/);
    });

    it('finishes the async operation', function() {
      var result = controls.asyncRethrowWhenOtherHandlersArePresent();
      var stdOut = result.stdout.toString('utf-8');
      expect(stdOut).to.contain('Async operation has finished.');
    });

    it('keeps the original stack trace', function() {
      var result = controls.asyncRethrowWhenOtherHandlersArePresent();
      var stdErr = result.stderr.toString('utf-8');
      expect(stdErr).to.not.be.empty;
      expect(stdErr).to.contain('Error: Boom');
      expect(stdErr).to.contain('_onTimeout');
      expect(stdErr).to.contain(
        'test/util/uncaughtExceptions/apps/asyncRethrowWhenOtherHandlersArePresent.js'
      );
    });
  });

  function countIn(string, pattern) {
    var regex = new RegExp(pattern, 'g');
    return (string.match(regex) || []).length;
  }
});
