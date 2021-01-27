/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const semver = require('semver');
const expect = require('chai').expect;

const controls = require('./apps/controls');

/**
 * This test suite does not test Instana code but verifies assumptions around process.on('uncaughtException') across
 * all supported Node.js versions.
 */
describe('uncaught exceptions assumptions - ', () => {
  describe('synchronous non-throwing uncaught exceptions handler', () => {
    it('executes handlers in order', () => {
      const result = controls.order();
      expect(result.status).to.equal(0);
      const stdOut = result.stdout.toString('utf-8');
      const stdErr = result.stderr.toString('utf-8');
      expect(stdOut).to.match(/HANDLER 1\s*HANDLER 2\s*Bye, bye/);
      expect(stdErr).to.be.empty;
    });
  });

  describe('synchronous rethrowing uncaught exceptions handler', () => {
    it('terminates the process', () => {
      const result = controls.rethrow();
      expect(result.status).to.equal(7);
    });

    // See https://github.com/nodejs/node/issues/28550 for why this test is excluded in v12.6.0 and
    // https://github.com/nodejs/node/pull/28562/commits/36fdf1aa6c87ccfaebabb8f9c8004baab0549b0b for the fix.
    const mochaFn =
      semver.gte(process.version, '8.0.0') && process.version !== 'v12.6.0' ? it.bind(this) : it.skip.bind(this);

    mochaFn('keeps the original stack trace', () => {
      const result = controls.rethrow();
      // Actually, it will be 7, see
      // https://nodejs.org/api/process.html#process_exit_codes
      expect(result.status).to.not.equal(1);
      const stdOut = result.stdout.toString('utf-8');
      const stdErr = result.stderr.toString('utf-8');
      expect(stdOut).to.be.empty;
      expect(stdErr).to.contain('Error: Boom');
      expect(stdErr).to.contain('_onTimeout');
      expect(stdErr).to.contain('test/uncaught/apps/rethrow.js');
    });

    mochaFn('executes handlers registered before rethrowing handler, but not handlers registered after that', () => {
      const result = controls.rethrowWhenOtherHandlersArePresent();
      expect(result.status).to.not.equal(0);
      const stdOut = result.stdout.toString('utf-8');
      const stdErr = result.stderr.toString('utf-8');
      expect(stdOut).to.match(/HANDLER 1\s*HANDLER 2\s*HANDLER 3/);
      expect(stdErr).to.not.be.empty;
      expect(stdErr).to.contain('Error: Boom');
      expect(stdErr).to.contain('_onTimeout');
      expect(stdErr).to.contain('test/uncaught/apps/rethrowWhenOtherHandlersArePresent.js');
    });
  });
});
