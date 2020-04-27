/* eslint-disable no-console */

'use strict';

const { expect } = require('chai');
const semver = require('semver');
const path = require('path');
const childProcess = require('child_process');
const rimraf = require('rimraf');

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const testUtils = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');

const babelAppDir = path.join(__dirname, '../../../apps/babel-typescript');
const babelLibDir = path.join(babelAppDir, 'lib');
let agentControls;

describe('tracing a babel/typescript setup', function() {
  if (!supportedVersion(process.versions.node) || semver.lt(process.versions.node, '8.0.0')) {
    return;
  }

  this.timeout(60000);

  before(done => {
    rimraf(babelLibDir, err => {
      if (err) {
        return done(err);
      }
      const originalWorkingDir = process.cwd();
      const command = 'npm install && npm run build';
      process.chdir(babelAppDir);
      console.log(`About to run "${command}" in ${process.cwd()} now, this might take a while.`);
      // If this fails with "Error: Cannot find module './testUtils'" there might be left over node_modules installed by
      // a different Node.js version. rm -rf packages/collector/test/apps/babel-typescript/node_modules and run again.
      childProcess.exec(command, (error, stdout, stderr) => {
        console.log(`STDOUT of ${command}: ${stdout}`);
        console.error(`STDERR of ${command}: ${stderr}`);
        process.chdir(originalWorkingDir);
        done(error);
      });
    });
  });

  after(done => {
    rimraf(babelLibDir, done);
  });

  agentControls = require('../../../apps/agentStubControls');

  this.timeout(config.getTestTimeout());

  agentControls.registerTestHooks();

  const controls = new ProcessControls({
    appPath: path.join(__dirname, '../../../apps/babel-typescript'),
    agentControls
  }).registerTestHooks();

  describe('@instana/collector used in a babel-transpiled typescript app', function() {
    it('should trace when imported with workaround according to our docs', () =>
      controls
        .sendRequest({
          path: '/'
        })
        .then(() =>
          testUtils.retry(() =>
            agentControls.getSpans().then(spans => {
              testUtils.expectAtLeastOneMatching(spans, span => {
                expect(span.n).to.equal('node.http.server');
                expect(span.k).to.equal(constants.ENTRY);
                expect(span.p).to.not.exist;
                expect(span.data.http.method).to.equal('GET');
                expect(span.data.http.url).to.equal('/');
              });
            })
          )
        ));
  });
});
