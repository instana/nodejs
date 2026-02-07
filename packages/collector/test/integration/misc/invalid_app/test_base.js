/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const path = require('path');
const childProcess = require('child_process');
const expect = require('chai').expect;
const config = require('@_local/core/test/config');

module.exports = function () {
  describe('tracing/invalidApp', function () {
    this.timeout(config.getTestTimeout() * 3);

    it('when the collector is required in interactive shell', cb => {
      const child = childProcess.spawn(
        process.execPath,
        ['--require', require.resolve('@_local/collector/src/immediate')],
        {
          stdio: 'inherit',
          cwd: process.cwd(),
          env: process.env
        }
      );

      child.on('error', err => {
        cb(err);
      });

      child.on('exit', (code, signal) => {
        expect(signal).to.equal('SIGTERM');
        expect(code).to.not.exist;
        cb();
      });

      setTimeout(() => {
        child.kill('SIGTERM');
      }, 3 * 1000);
    });
  });
};
