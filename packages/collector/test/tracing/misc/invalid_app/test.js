/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const path = require('path');
const childProcess = require('child_process');
const expect = require('chai').expect;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/invalidApp', function () {
  this.timeout(config.getTestTimeout() * 3);

  it('when the collector is required in interactive shell', cb => {
    const child = childProcess.spawn(
      process.execPath,
      ['--require', path.join(__dirname, '..', '..', '..', '..', 'src', 'immediate.js')],
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
